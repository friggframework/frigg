const { runInContext } = require('../logs/context');
const { summarizeMessageBody } = require('../logs/summarize-event');
const { flushSinks, hasFlushableSinks } = require('../logs/logger-runtime');

// Bounds the tail latency telemetry adds to every warm invocation. Kept low so
// an unreachable OTLP endpoint (e.g. a VPC Lambda with no NAT/egress) costs at
// most this, not multiple seconds. Override with OTEL_FLUSH_TIMEOUT_MS.
const DEFAULT_FLUSH_TIMEOUT_MS =
    Number(process.env.OTEL_FLUSH_TIMEOUT_MS) || 500;

// Time kept back from the Lambda deadline, so a slow flush never becomes a
// Lambda timeout.
const FLUSH_MARGIN_MS = 50;

// setTimeout fires at once for a delay above this.
const MAX_TIMER_MS = 2 ** 31 - 1;

/**
 * Fold the invocation's buffered usage counters into the durable store, then
 * clear the buffer. On an SQS redelivery (ApproximateReceiveCount > 1) we
 * DISCARD rather than flush — the prior delivery already counted, and the usage
 * accuracy contract is "approximate, skip obvious redeliveries". Fully guarded.
 */
async function flushUsageRollup(subscriber, eventSummary, shouldUseDatabase) {
    if (!subscriber) return;
    try {
        // Persisting usage requires a DB connection. DB-free handlers (e.g. the
        // webhook-receipt route) never called connectPrisma, so drop the buffer
        // instead of issuing a connectionless Prisma write.
        if (!shouldUseDatabase) {
            subscriber.discard();
            return;
        }
        // Discard only when EVERY record in the batch is a redelivery. The buffer
        // is invocation-scoped (not per-message), so discarding on *any*
        // redelivery would drop the fresh records' counts too (silent
        // under-count). For a mixed batch we flush: preserving fresh counts and
        // at worst re-counting the one redelivered record is strictly better than
        // losing fresh data for an approximate store. (Integration queue workers
        // are batchSize:1 today, so a batch is all-or-nothing; this keeps it
        // correct if batchSize is ever raised.)
        const records = Array.isArray(eventSummary?.records)
            ? eventSummary.records
            : [];
        const allRedelivered =
            records.length > 0 &&
            records.every((r) => Number(r.receiveCount) > 1);
        if (allRedelivered) {
            subscriber.discard();
        } else {
            await subscriber.flush();
        }
    } catch (_) {
        // Usage rollup must never break the handler.
    }
}

function isTelemetryEnabled(telemetry) {
    try {
        return Boolean(
            telemetry &&
                typeof telemetry.isEnabled === 'function' &&
                telemetry.isEnabled()
        );
    } catch (_) {
        return false;
    }
}

/**
 * Flush telemetry before the Lambda container freezes. Because
 * `callbackWaitsForEmptyEventLoop=false` stops the event loop the moment the
 * handler returns, OTel's timer-driven batch processors would never fire — so
 * spans/metrics must be flushed here. No timer of its own: the caller bounds it
 * with `withDeadline`. Fully guarded, so a flush failure never breaks the
 * handler.
 */
async function flushTelemetry(telemetry, { signal } = {}) {
    if (!isTelemetryEnabled(telemetry) || signal?.aborted) return;
    try {
        await telemetry.forceFlush();
    } catch (_) {
        // Telemetry flush must never break the handler.
    }
}

/**
 * Run `fn(signal)` for at most `ms`. Owns the only timer and clears it when the
 * work settles. Aborts the signal at the deadline. Never rejects, and a late
 * rejection of the work is swallowed.
 */
function withDeadline(ms, fn) {
    const controller = new AbortController();
    return new Promise((resolve) => {
        let timer;
        const finish = () => {
            clearTimeout(timer);
            resolve();
        };
        timer = setTimeout(() => {
            controller.abort();
            finish();
        }, Math.min(ms, MAX_TIMER_MS));
        let work;
        try {
            work = Promise.resolve(fn(controller.signal));
        } catch (_) {
            work = Promise.resolve();
        }
        work.then(finish, finish);
    });
}

function remainingTimeMs(context) {
    try {
        const remaining = context?.getRemainingTimeInMillis?.();
        return typeof remaining === 'number' ? remaining : Infinity;
    } catch (_) {
        return Infinity;
    }
}

async function flushInvocation({
    telemetry,
    usageRollup,
    eventSummary,
    shouldUseDatabase,
    flushTimeoutMs,
    context,
}) {
    // ADR-048 §11: usage first and unbounded, then one deadline for the rest.
    await flushUsageRollup(usageRollup, eventSummary, shouldUseDatabase);

    const flushes = [];
    if (isTelemetryEnabled(telemetry)) {
        flushes.push((signal) => flushTelemetry(telemetry, { signal }));
    }
    if (hasFlushableSinks()) {
        flushes.push((signal) => flushSinks({ signal }));
    }
    if (!flushes.length) return;

    const deadline = Math.min(
        flushTimeoutMs,
        remainingTimeMs(context) - FLUSH_MARGIN_MS
    );
    if (!(deadline > 0)) return;
    await withDeadline(deadline, (signal) =>
        Promise.allSettled(flushes.map((flush) => flush(signal)))
    );
}

/**
 * Open the logger scope for one invocation, run `fn` inside it, then flush.
 * `fields` (requestId, handlerName, method, route, routeKey, invocation, ...)
 * go into the scope's logger sub-object and never reach the telemetry bus.
 */
async function runInvocationScope(fields, fn, opts = {}) {
    const {
        telemetry,
        usageRollup,
        eventSummary,
        shouldUseDatabase = true,
        flushTimeoutMs = DEFAULT_FLUSH_TIMEOUT_MS,
        context,
    } = opts;
    return runInContext({ log: { ...(fields || {}) } }, async () => {
        try {
            return await fn();
        } finally {
            try {
                await flushInvocation({
                    telemetry,
                    usageRollup,
                    eventSummary,
                    shouldUseDatabase,
                    flushTimeoutMs,
                    context,
                });
            } catch (_) {
                // A flush must never change the handler result.
            }
        }
    });
}

function toCount(value) {
    const count = Number(value);
    return value !== undefined && value !== null && Number.isFinite(count)
        ? count
        : undefined;
}

/**
 * Open the logger scope for one SQS message: messageId, receiveCount and the
 * Frigg ids the body carries. No flush; the invocation scope owns that.
 */
function runMessageScope(record, fn) {
    const { event, processId, integrationId } = summarizeMessageBody(
        record?.body
    );
    return runInContext(
        {
            log: {
                messageId: record?.messageId,
                receiveCount: toCount(record?.attributes?.ApproximateReceiveCount),
                integrationEvent: event,
                processId,
                integrationId,
            },
        },
        fn
    );
}

module.exports = {
    runInvocationScope,
    runMessageScope,
    withDeadline,
    flushTelemetry,
    flushUsageRollup,
    FLUSH_MARGIN_MS,
    DEFAULT_FLUSH_TIMEOUT_MS,
};
