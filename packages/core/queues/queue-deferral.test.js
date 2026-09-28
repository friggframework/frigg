const {
    MAX_DEFERRALS,
    MAX_DEFERRALS_ENV,
    MAX_DEFERRED_MS,
    MAX_DEFERRED_MS_ENV,
    MAX_DELAY_SECONDS,
    MAX_VISIBILITY_TIMEOUT_SECONDS,
    isDeferralCapped,
    nextDeferral,
    readDeferral,
    readDeferralLimits,
    withDeferral,
} = require('./queue-deferral');

const NOW = Date.parse('2026-09-28T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;

describe('queue-deferral', () => {
    it('exposes the SQS limits and the default caps', () => {
        expect(MAX_DELAY_SECONDS).toBe(900);
        expect(MAX_VISIBILITY_TIMEOUT_SECONDS).toBe(43_200);
        expect(MAX_DEFERRALS).toBe(10);
        expect(MAX_DEFERRED_MS).toBe(24 * HOUR);
        expect(MAX_DEFERRALS_ENV).toBe('FRIGG_QUEUE_MAX_DEFERRALS');
        expect(MAX_DEFERRED_MS_ENV).toBe('FRIGG_QUEUE_MAX_DEFERRED_MS');
    });

    describe('readDeferralLimits', () => {
        it('returns the defaults when the environment sets nothing', () => {
            expect(readDeferralLimits({})).toEqual({
                maxDeferrals: 10,
                maxDeferredMs: 24 * HOUR,
            });
        });

        it('reads both limits from the environment', () => {
            expect(
                readDeferralLimits({
                    [MAX_DEFERRALS_ENV]: '3',
                    [MAX_DEFERRED_MS_ENV]: '7200000',
                })
            ).toEqual({ maxDeferrals: 3, maxDeferredMs: 7_200_000 });
        });

        it.each(['0', '-1', '1.5', 'many', ''])(
            'ignores the value %j',
            (value) => {
                expect(
                    readDeferralLimits({
                        [MAX_DEFERRALS_ENV]: value,
                        [MAX_DEFERRED_MS_ENV]: value,
                    })
                ).toEqual({ maxDeferrals: 10, maxDeferredMs: 24 * HOUR });
            }
        );

        it('reads process.env when no environment is given', () => {
            const previous = process.env[MAX_DEFERRALS_ENV];
            process.env[MAX_DEFERRALS_ENV] = '4';
            try {
                expect(readDeferralLimits().maxDeferrals).toBe(4);
            } finally {
                if (previous === undefined)
                    delete process.env[MAX_DEFERRALS_ENV];
                else process.env[MAX_DEFERRALS_ENV] = previous;
            }
        });
    });

    describe('readDeferral', () => {
        it('reads zero deferrals from a body with no _frigg', () => {
            expect(readDeferral({ event: 'X' })).toEqual({
                deferrals: 0,
                firstDeferredAt: undefined,
            });
            expect(readDeferral(undefined)).toEqual({
                deferrals: 0,
                firstDeferredAt: undefined,
            });
        });

        it('reads the counters of a deferred body', () => {
            const firstDeferredAt = new Date(NOW).toISOString();
            expect(
                readDeferral({ _frigg: { deferrals: 2, firstDeferredAt } })
            ).toEqual({ deferrals: 2, firstDeferredAt });
        });

        it.each([
            [{ deferrals: -1 }],
            [{ deferrals: 1.5 }],
            [{ deferrals: 'two' }],
            [{ firstDeferredAt: 'yesterday' }],
            [{ firstDeferredAt: 5 }],
        ])('ignores an invalid counter %j', (frigg) => {
            expect(readDeferral({ _frigg: frigg })).toEqual({
                deferrals: 0,
                firstDeferredAt: undefined,
            });
        });
    });

    describe('nextDeferral', () => {
        it('starts at 1 and stamps the first deferral time', () => {
            expect(nextDeferral({ event: 'X' }, NOW)).toEqual({
                deferrals: 1,
                firstDeferredAt: new Date(NOW).toISOString(),
            });
        });

        it('adds one and keeps the first deferral time', () => {
            const firstDeferredAt = new Date(NOW - HOUR).toISOString();
            expect(
                nextDeferral({ _frigg: { deferrals: 2, firstDeferredAt } }, NOW)
            ).toEqual({ deferrals: 3, firstDeferredAt });
        });
    });

    describe('withDeferral', () => {
        it('puts the counters in _frigg and keeps the rest of the body', () => {
            const body = {
                event: 'X',
                data: { processId: 4 },
                _frigg: { other: true },
            };
            const deferral = {
                deferrals: 1,
                firstDeferredAt: new Date(NOW).toISOString(),
            };
            expect(withDeferral(body, deferral)).toEqual({
                event: 'X',
                data: { processId: 4 },
                _frigg: { other: true, ...deferral },
            });
            expect(body._frigg).toEqual({ other: true });
        });
    });

    describe('isDeferralCapped', () => {
        const limits = { maxDeferrals: 3, maxDeferredMs: 2 * HOUR };
        const first = new Date(NOW).toISOString();

        it('does not cap a deferral inside both limits', () => {
            expect(
                isDeferralCapped(
                    {
                        deferrals: 3,
                        firstDeferredAt: first,
                        retryAt: new Date(NOW + HOUR),
                    },
                    limits
                )
            ).toBe(false);
        });

        it('caps a deferral past the count', () => {
            expect(
                isDeferralCapped(
                    {
                        deferrals: 4,
                        firstDeferredAt: first,
                        retryAt: new Date(NOW + 1_000),
                    },
                    limits
                )
            ).toBe(true);
        });

        it('caps a deferral whose retry time is past the total time, counted from the first deferral', () => {
            expect(
                isDeferralCapped(
                    {
                        deferrals: 2,
                        firstDeferredAt: first,
                        retryAt: new Date(NOW + 2 * HOUR + 1),
                    },
                    limits
                )
            ).toBe(true);
            expect(
                isDeferralCapped(
                    {
                        deferrals: 2,
                        firstDeferredAt: first,
                        retryAt: new Date(NOW + 2 * HOUR),
                    },
                    limits
                )
            ).toBe(false);
        });
    });
});
