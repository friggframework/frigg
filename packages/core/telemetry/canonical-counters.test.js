const {
    CANONICAL_COUNTERS,
    isCanonicalCounter,
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
