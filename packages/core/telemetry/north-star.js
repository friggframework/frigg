/**
 * Adopter North Star metric (ADR-011 Decision 5). A North Star simply references
 * a usage-counter key (canonical or custom); its value is then read like any
 * other counter via `frigg.usage.totals({ metric: northStarKey })`. It is
 * populated either by (a) direct emission of that counter, or (b) derived from a
 * framework trace signal — this module implements (b) as a small bus subscriber
 * that emits the North Star counter when a configured signal matches.
 */

/** Resolve the North Star counter entry for an integration type (byType wins). */
function resolveNorthStarEntry(northStar, integrationType) {
    if (!northStar) return null;
    return (
        (northStar.byType && northStar.byType[integrationType]) ||
        northStar.default ||
        null
    );
}

/** The set of counter keys any North Star references — added to trackedMetrics. */
function northStarKeys(northStar) {
    const keys = new Set();
    if (!northStar) return keys;
    if (northStar.default?.name) keys.add(northStar.default.name);
    for (const entry of Object.values(northStar.byType || {})) {
        if (entry?.name) keys.add(entry.name);
    }
    return keys;
}

function matchesDeriveFrom(
    deriveFrom,
    { name, attributes = {}, context = {} }
) {
    if (!deriveFrom) return false;

    if (deriveFrom.userAction) {
        const rule = deriveFrom.userAction;
        return (
            name === 'frigg.handler.invocations' &&
            attributes.event === 'USER_ACTION' &&
            (!rule.action || context.event_name === rule.action)
        );
    }

    if (deriveFrom.apiRequest) {
        const rule = deriveFrom.apiRequest;
        return (
            name === 'frigg.apimodule.requests' &&
            (!rule.method || attributes.method === rule.method) &&
            (!rule.endpoint ||
                (typeof context.url === 'string' &&
                    context.url.includes(rule.endpoint)))
        );
    }

    return false;
}

/**
 * Subscribe to the bus and emit the North Star counter whenever a configured
 * `deriveFrom` signal matches (config-only, no integration code). The emitted
 * counter flows back through the bus to the usage rollup like any other metric.
 */
function createNorthStarDerivationSubscriber({ telemetry, northStar }) {
    if (!telemetry || !northStar) return { unsubscribe() {} };

    function onMetric(payload) {
        try {
            // Never react to a North Star counter's own emission (no loop).
            const keys = northStarKeys(northStar);
            if (keys.has(payload.name)) return;

            const integrationType =
                payload.context?.integrationType ||
                payload.attributes?.integration_type ||
                null;
            const entry = resolveNorthStarEntry(northStar, integrationType);
            if (!entry || !entry.deriveFrom) return;
            if (!matchesDeriveFrom(entry.deriveFrom, payload)) return;

            telemetry.count(
                entry.name,
                1,
                integrationType ? { integration_type: integrationType } : {},
                payload.context
            );
        } catch (_) {
            // Derivation must never break emission.
        }
    }

    const unsubscribe = telemetry.on('metric', onMetric);
    return { unsubscribe };
}

module.exports = {
    resolveNorthStarEntry,
    northStarKeys,
    createNorthStarDerivationSubscriber,
};
