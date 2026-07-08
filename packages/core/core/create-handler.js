// This line should be at the top of the webpacked output, so be sure to require createHandler first in any handlers.  "Soon" sourcemaps will be built into Node... after that, this package won't be needed.
// REMOVING FOR NOW UNTIL WE ADD WEBPACK BACK IN
// require('source-map-support').install();

const { initDebugLog, flushDebugLog } = require('../logs');
const { secretsToEnv } = require('./secrets-to-env');
const { getTelemetry } = require('../telemetry/telemetry-singleton');
const {
    getUsageRollupSubscriber,
} = require('../telemetry/usage-rollup-singleton');
const {
    getPluginTelemetrySubscribers,
} = require('../telemetry/plugin-subscribers-singleton');

// Bounds the tail latency telemetry adds to every warm invocation. Kept low so
// an unreachable OTLP endpoint (e.g. a VPC Lambda with no NAT/egress) costs at
// most this, not multiple seconds. Override with OTEL_FLUSH_TIMEOUT_MS.
const DEFAULT_FLUSH_TIMEOUT_MS =
    Number(process.env.OTEL_FLUSH_TIMEOUT_MS) || 500;

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

/**
 * Flush telemetry before the Lambda container freezes. Because
 * `callbackWaitsForEmptyEventLoop=false` (below) stops the event loop the moment
 * the handler returns, OTel's timer-driven batch processors would never fire —
 * so spans/metrics must be flushed synchronously here. Bounded by a timeout so a
 * stalled exporter can never block the response, and fully guarded so a flush
 * failure never breaks the handler.
 */
async function flushTelemetry(telemetry, timeoutMs) {
    try {
        if (
            !telemetry ||
            typeof telemetry.isEnabled !== 'function' ||
            !telemetry.isEnabled()
        ) {
            return;
        }
        let timer;
        const deadline = new Promise((resolve) => {
            timer = setTimeout(resolve, timeoutMs);
        });
        try {
            await Promise.race([
                Promise.resolve(telemetry.forceFlush()),
                deadline,
            ]);
        } finally {
            clearTimeout(timer);
        }
    } catch (_) {
        // Telemetry flush must never break the handler.
    }
}

// Best-effort extraction of correlation identifiers from a Lambda event.
// For SQS: pulls messageIds + parsed event/processId/integrationId from each
// record body. For HTTP: pulls method+path. Never throws.
const summarizeLambdaEvent = (event) => {
    if (!event) return {};
    if (Array.isArray(event.Records)) {
        return {
            source: 'sqs',
            records: event.Records.map((r) => {
                let parsed = {};
                try {
                    const body = JSON.parse(r.body);
                    parsed = {
                        event: body?.event,
                        processId: body?.data?.processId,
                        integrationId: body?.data?.integrationId,
                    };
                } catch {
                    // ignore unparseable bodies
                }
                return {
                    messageId: r.messageId,
                    receiveCount: r.attributes?.ApproximateReceiveCount,
                    ...parsed,
                };
            }),
        };
    }
    if (event.httpMethod || event.requestContext?.http) {
        return {
            source: 'http',
            method: event.httpMethod || event.requestContext?.http?.method,
            path: event.path || event.rawPath,
        };
    }
    return { source: 'other' };
};

const createHandler = (optionByName = {}) => {
    const {
        eventName = 'Event',
        isUserFacingResponse = true,
        method,
        shouldUseDatabase = true,
        telemetry,
        flushTimeoutMs = DEFAULT_FLUSH_TIMEOUT_MS,
        usageRollup,
    } = optionByName;

    if (!method) {
        throw new Error('Method is required for handler.');
    }

    return async (event, context) => {
        const eventSummary = summarizeLambdaEvent(event);
        const activeTelemetry = telemetry || getTelemetry();
        const activeUsageRollup =
            usageRollup !== undefined
                ? usageRollup
                : getUsageRollupSubscriber();

        // Wire adopter-declared telemetry subscribers once per cold start
        // (ADR-011 Decision 6). Memoized in the singleton, so this is a cheap
        // no-op after the first invocation.
        getPluginTelemetrySubscribers();

        try {
            console.info(`[createHandler] ${eventName}: handler entry`, {
                eventName,
                awsRequestId: context?.awsRequestId,
                ...eventSummary,
            });

            initDebugLog(eventName, event);

            const requestMethod = event.httpMethod;
            const requestPath = event.path;
            if (requestMethod && requestPath) {
                console.info(`${requestMethod} ${requestPath}`);
            }

            // If enabled (i.e. if SECRET_ARN is set in process.env) Fetch secrets from AWS Secrets Manager, and set them as environment variables.
            await secretsToEnv();

            // Lazy-required so DB-free handlers never load the Prisma client.
            if (shouldUseDatabase) {
                const { connectPrisma } = require('../database/prisma');
                await connectPrisma();
            }

            // Helps reuse the database connection.  Lowers response times.
            context.callbackWaitsForEmptyEventLoop = false;

            // Run the Lambda
            return await method(event, context);
        } catch (error) {
            flushDebugLog(error);

            // Don't leak implementation details to end users.
            if (isUserFacingResponse) {
                // Allow client-safe errors to pass through with their actual message
                if (error.isClientSafe === true) {
                    const statusCode = error.statusCode || 400;
                    return {
                        statusCode,
                        body: JSON.stringify({
                            error: error.message,
                        }),
                    };
                }

                // Hide other errors with generic message
                return {
                    statusCode: 500,
                    body: JSON.stringify({
                        error: 'An Internal Error Occurred',
                    }),
                };
            }

            // Handle server-to-server responses.

            // Halt errors are logged but suceed and won't be retried.
            // Log explicitly — silent suppression here previously made stuck
            // messages invisible to observability tooling. Include
            // eventSummary so operators can correlate across concurrent
            // invocations (processId / messageIds / HTTP path).
            if (error.isHaltError === true) {
                console.warn(
                    `[createHandler] ${eventName}: halt error suppressed (no retry)`,
                    {
                        eventName,
                        errorName: error.name,
                        errorMessage: error.message,
                        statusCode: error.statusCode,
                        ...eventSummary,
                    }
                );
                return;
            }

            // Here we can just rethrow and let AWS build the response.
            throw error;
        } finally {
            // Flush telemetry + usage before the container freezes.
            await flushTelemetry(activeTelemetry, flushTimeoutMs);
            await flushUsageRollup(
                activeUsageRollup,
                eventSummary,
                shouldUseDatabase
            );
        }
    };
};

module.exports = { createHandler };
