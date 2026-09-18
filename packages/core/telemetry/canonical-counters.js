/**
 * Canonical usage-counter vocabulary.
 *
 * These core-owned, versioned keys are the ONLY metrics guaranteed comparable
 * *across* integration types — they power ADR-010's apples-to-apples comparison
 * report. Custom keys (declared in an integration's `Definition.usage.custom`)
 * are comparable only *within* an integration type.
 *
 * The registry is **additive**: new keys may be added, existing keys never
 * change or are removed, so existing reports never break.
 *
 * `dims` are the bounded dimensions a counter may carry (Cardinality note) —
 * high-cardinality ids (integrationId, userId) never appear here.
 */
const CANONICAL_COUNTERS = {
    'records.synced': {
        unit: 'count',
        label: 'Records synced',
        dims: ['entity'],
    },
    'webhooks.received': {
        unit: 'count',
        label: 'Webhooks received',
        dims: ['event'],
    },
    'workflows.invoked': {
        unit: 'count',
        label: 'Workflows invoked',
        dims: ['workflow'],
    },
    'api.requests': {
        unit: 'count',
        label: 'API requests',
        dims: ['endpoint', 'status'],
    },
    user_actions: { unit: 'count', label: 'User actions', dims: ['action'] },
};

// NOTE: the framework-signal → canonical mapping lives in the usage rollup
// subscriber (METRIC_TO_CANONICAL, keyed by the actual emitted metric names).
// `records.synced` / `workflows.invoked` have no auto-signal — they are
// explicit-only (`this.telemetry.count(...)`), so a canonical counter is never
// shipped that silently stays at zero.

function isCanonicalCounter(name) {
    return Object.prototype.hasOwnProperty.call(CANONICAL_COUNTERS, name);
}

module.exports = {
    CANONICAL_COUNTERS,
    isCanonicalCounter,
};
