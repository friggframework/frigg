const { isCanonicalCounter } = require('../telemetry/canonical-counters');

/**
 * Compute the set of usage-counter keys the rollup should persist, from each
 * integration's `Definition.usage` opt-in (ADR-011 Usage-Counter Contract §2).
 * Declaring a canonical key opts into cross-type comparison + the rollup; custom
 * keys are tracked per integration type. Unknown canonical keys are dropped with
 * a warning (lazy validation, matching how Definition is treated elsewhere).
 */
function computeTrackedMetrics(integrationClasses = []) {
    const tracked = new Set();
    if (!Array.isArray(integrationClasses)) return tracked;

    for (const IntegrationClass of integrationClasses) {
        const usage = IntegrationClass?.Definition?.usage;
        if (!usage) continue;
        const name = IntegrationClass.Definition?.name || 'integration';

        for (const key of usage.canonical || []) {
            if (!isCanonicalCounter(key)) {
                console.warn(
                    `[Frigg][usage] "${name}" declares unknown canonical counter "${key}" — ignored. ` +
                        `Use a key from CANONICAL_COUNTERS or declare it under usage.custom.`
                );
                continue;
            }
            tracked.add(key);
        }

        for (const key of Object.keys(usage.custom || {})) {
            tracked.add(key);
        }
    }

    return tracked;
}

module.exports = { computeTrackedMetrics };
