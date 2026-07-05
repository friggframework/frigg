const {
    CANONICAL_COUNTERS,
    isCanonicalCounter,
    AUTO_SIGNAL_TO_CANONICAL,
    canonicalForSignal,
} = require('./canonical-counters');

describe('CANONICAL_COUNTERS registry', () => {
    it('declares the core-owned canonical vocabulary with units and dims', () => {
        expect(Object.keys(CANONICAL_COUNTERS).sort()).toEqual(
            [
                'api.requests',
                'records.synced',
                'user_actions',
                'webhooks.received',
                'workflows.invoked',
            ].sort()
        );
        expect(CANONICAL_COUNTERS['records.synced']).toMatchObject({
            unit: 'count',
            dims: ['entity'],
        });
    });

    it('recognizes canonical vs custom keys', () => {
        expect(isCanonicalCounter('records.synced')).toBe(true);
        expect(isCanonicalCounter('deals.enriched')).toBe(false);
    });
});

describe('auto-signal → canonical mapping', () => {
    it('maps framework signals to the canonical counter they feed', () => {
        expect(canonicalForSignal('apimodule.request')).toBe('api.requests');
        expect(canonicalForSignal('webhook.received')).toBe(
            'webhooks.received'
        );
        expect(canonicalForSignal('user_action')).toBe('user_actions');
    });

    it('has no auto signal for explicit-only counters (records.synced, workflows.invoked)', () => {
        const auto = Object.values(AUTO_SIGNAL_TO_CANONICAL);
        expect(auto).not.toContain('records.synced');
        expect(auto).not.toContain('workflows.invoked');
    });
});
