const { computeTrackedMetrics } = require('./tracked-metrics');

const makeClass = (name, usage) => ({ Definition: { name, usage } });

describe('computeTrackedMetrics (ADR-011 Definition.usage opt-in)', () => {
    it('collects declared canonical + custom keys across integrations', () => {
        const tracked = computeTrackedMetrics([
            makeClass('hubspot', {
                canonical: ['records.synced', 'api.requests'],
                custom: { 'deals.enriched': { unit: 'count' } },
            }),
            makeClass('slack', { canonical: ['webhooks.received'] }),
        ]);

        expect([...tracked].sort()).toEqual(
            [
                'api.requests',
                'deals.enriched',
                'records.synced',
                'webhooks.received',
            ].sort()
        );
    });

    it('ignores an unknown canonical key with a warning', () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const tracked = computeTrackedMetrics([
            makeClass('x', { canonical: ['records.synced', 'not.a.canon'] }),
        ]);

        expect(tracked.has('records.synced')).toBe(true);
        expect(tracked.has('not.a.canon')).toBe(false);
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    it('returns an empty set when no integration declares usage', () => {
        const tracked = computeTrackedMetrics([
            makeClass('x'),
            makeClass('y', undefined),
        ]);
        expect(tracked.size).toBe(0);
    });

    it('is defensive against a null/empty input', () => {
        expect(computeTrackedMetrics().size).toBe(0);
        expect(computeTrackedMetrics([null]).size).toBe(0);
    });
});
