const { computeUsageWindows } = require('./usage-windows');

const WEBHOOK_EVENT_NAMES = new Set(['ON_WEBHOOK']);

/**
 * Framework auto-signal metric names → the canonical usage key they feed
 * (ADR-011 §3). Resolvers receive (attributes, context) and may return null to
 * decline. Handler invocations map by event: USER_ACTION → user_actions; the
 * DB-connected `ON_WEBHOOK` queue dispatch → webhooks.received (per-integration,
 * and where a durable write is actually possible — the HTTP receipt handler is
 * DB-free so its buffer is discarded).
 */
const METRIC_TO_CANONICAL = {
    'frigg.apimodule.requests': () => 'api.requests',
    'frigg.handler.invocations': (attrs, ctx) => {
        if (attrs && attrs.event === 'USER_ACTION') return 'user_actions';
        if (ctx && WEBHOOK_EVENT_NAMES.has(ctx.event_name)) {
            return 'webhooks.received';
        }
        return null;
    },
};

/**
 * The built-in usage-rollup subscriber (ADR-011 Decision 7). Subscribes to the
 * telemetry event bus and folds *declared* counters (canonical or custom) into
 * the durable usage store. It buffers within an invocation and writes on
 * `flush()` (no timers — Lambda-safe), or drops the buffer on `discard()` for an
 * SQS redelivery so at-least-once delivery does not double-count (approximate
 * accuracy contract).
 *
 * Attribution: high-cardinality ids never ride metric labels, so integrationId
 * comes from the bus-only `context` (populated from the ambient handler context)
 * and otherwise falls back to the bounded integration_type.
 */
function createUsageRollupSubscriber({
    telemetry,
    usageRepository,
    trackedMetrics = new Set(),
    now = () => new Date(),
}) {
    // Buffer key is a JSON tuple [integrationId, integrationType, metric, window]
    // — collision-proof for developer-defined custom keys / names.
    let buffer = new Map();

    function resolveUsageKey(name, attributes, context) {
        if (trackedMetrics.has(name)) return name;
        const resolver = METRIC_TO_CANONICAL[name];
        const canonical = resolver ? resolver(attributes || {}, context) : null;
        return canonical && trackedMetrics.has(canonical) ? canonical : null;
    }

    function onMetric(payload) {
        try {
            const { name, value = 1, attributes = {}, context } = payload;
            const metric = resolveUsageKey(name, attributes, context);
            if (!metric) return;

            const integrationType =
                context?.integrationType || attributes.integration_type || null;
            if (!integrationType) return; // cannot attribute — skip

            const integrationId = context?.integrationId || integrationType;

            for (const window of computeUsageWindows(now())) {
                const key = JSON.stringify([
                    integrationId,
                    integrationType,
                    metric,
                    window,
                ]);
                buffer.set(key, (buffer.get(key) || 0) + value);
            }
        } catch (_) {
            // Rollup must never break emission.
        }
    }

    const unsubscribe = telemetry.on('metric', onMetric);

    async function flush() {
        if (buffer.size === 0) return;
        const pending = buffer;
        buffer = new Map();
        for (const [key, value] of pending) {
            const [integrationId, integrationType, metric, window] =
                JSON.parse(key);
            try {
                await usageRepository.increment({
                    integrationId,
                    integrationType,
                    metric,
                    window,
                    value,
                });
            } catch (_) {
                // A single failed write must not abort the rest of the flush.
            }
        }
    }

    function discard() {
        buffer = new Map();
    }

    return {
        flush,
        discard,
        unsubscribe,
        get bufferSize() {
            return buffer.size;
        },
    };
}

module.exports = { createUsageRollupSubscriber, METRIC_TO_CANONICAL };
