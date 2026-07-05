/**
 * Canonical usage-counter vocabulary (ADR-011 Usage-Counter Contract §1).
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

/**
 * Framework auto-instrumentation signal → the canonical counter it feeds
 * (Usage-Counter Contract §3, "one path, two sources"). Only these signals are
 * auto-emitted; `records.synced` and `workflows.invoked` are deliberately absent
 * — they are explicit-only (`this.telemetry.count(...)`) so we never ship a
 * canonical counter that silently stays at zero.
 */
const AUTO_SIGNAL_TO_CANONICAL = {
    'apimodule.request': 'api.requests',
    'webhook.received': 'webhooks.received',
    user_action: 'user_actions',
};

function isCanonicalCounter(name) {
    return Object.prototype.hasOwnProperty.call(CANONICAL_COUNTERS, name);
}

function canonicalForSignal(signal) {
    return AUTO_SIGNAL_TO_CANONICAL[signal] || null;
}

module.exports = {
    CANONICAL_COUNTERS,
    AUTO_SIGNAL_TO_CANONICAL,
    isCanonicalCounter,
    canonicalForSignal,
};
