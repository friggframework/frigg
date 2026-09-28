const {
    BUILT_IN_PARSERS,
    MAX_HINT_WAIT_MS,
    headerValue,
    parseIetfRateLimit,
    parseResetHeaders,
    parseRetryAfter,
} = require('./parsers');

const NOW = Date.parse('2026-09-28T12:00:00.000Z');
const MAX_SECONDS = MAX_HINT_WAIT_MS / 1000;

describe('rate-limit/parsers', () => {
    describe('headerValue', () => {
        const cases = {
            'a Headers-like object': () => ({
                get: (name) =>
                    name.toLowerCase() === 'retry-after' ? '5' : null,
            }),
            'a Map with a differently cased key': () =>
                new Map([['Retry-After', '5']]),
            'an entries array': () => [['Retry-After', '5']],
            'a plain object with a differently cased key': () => ({
                'RETRY-AFTER': '5',
            }),
            'a Headers-like object that is also iterable': () => ({
                get: () => null,
                [Symbol.iterator]: function* () {
                    yield ['retry-after', '5'];
                },
            }),
        };

        it.each(Object.keys(cases))('reads a header from %s', (shape) => {
            expect(headerValue(cases[shape](), 'retry-after')).toBe('5');
        });

        it.each([
            ['null headers', null],
            ['undefined headers', undefined],
            ['a string', 'Retry-After: 5'],
            ['an empty object', {}],
            ['a get() that finds nothing', { get: () => null }],
        ])('returns undefined for %s', (_label, headers) => {
            expect(headerValue(headers, 'retry-after')).toBeUndefined();
        });

        it('trims the value and treats a blank value as missing', () => {
            expect(headerValue({ 'retry-after': '  7 ' }, 'retry-after')).toBe(
                '7'
            );
            expect(
                headerValue({ 'retry-after': '   ' }, 'retry-after')
            ).toBeUndefined();
        });

        it('takes the first value of a multi-value header', () => {
            expect(
                headerValue({ 'retry-after': ['9', '10'] }, 'retry-after')
            ).toBe('9');
        });
    });

    describe('parseRetryAfter', () => {
        it.each([
            ['120', 120_000],
            ['0', 0],
            ['1.5', 1_500],
            [' 7 ', 7_000],
            [String(MAX_SECONDS), MAX_HINT_WAIT_MS],
        ])('reads delta seconds %j as %d ms', (value, waitMs) => {
            const hint = parseRetryAfter(value, { now: NOW });
            expect(hint).toEqual({
                waitMs,
                retryAt: new Date(NOW + waitMs),
                source: 'header',
            });
        });

        it('reads an HTTP-date in the future', () => {
            const value = new Date(NOW + 30_000).toUTCString();
            expect(parseRetryAfter(value, { now: NOW })).toEqual({
                waitMs: 30_000,
                retryAt: new Date(NOW + 30_000),
                source: 'header',
            });
        });

        it('reads an ISO timestamp in the future', () => {
            const value = new Date(NOW + 45_000).toISOString();
            expect(parseRetryAfter(value, { now: NOW })).toEqual({
                waitMs: 45_000,
                retryAt: new Date(NOW + 45_000),
                source: 'header',
            });
        });

        it('keeps the date but waits 0 ms for a date in the past', () => {
            const past = new Date(NOW - 60_000);
            expect(parseRetryAfter(past.toUTCString(), { now: NOW })).toEqual({
                waitMs: 0,
                retryAt: past,
                source: 'header',
            });
        });

        it.each([
            ['a negative number', '-5'],
            ['a word', 'soon'],
            ['an empty string', ''],
            ['undefined', undefined],
            ['null', null],
            ['a number that is not finite', '1e400'],
            ['seconds above the cap', String(MAX_SECONDS + 1)],
            ['a hex number', '0x10'],
            ['a digit string with a suffix', '12abc'],
            ['a bare ISO date without a time', '2026-09-28'],
        ])('returns null for %s', (_label, value) => {
            expect(parseRetryAfter(value, { now: NOW })).toBeNull();
        });

        it('returns null for an HTTP-date above the cap', () => {
            const far = new Date(NOW + MAX_HINT_WAIT_MS + 60_000).toUTCString();
            expect(parseRetryAfter(far, { now: NOW })).toBeNull();
        });

        it('uses the current time when no clock is given', () => {
            const before = Date.now();
            const hint = parseRetryAfter('10');
            expect(hint.retryAt.getTime()).toBeGreaterThanOrEqual(
                before + 10_000
            );
        });
    });

    describe('parseResetHeaders', () => {
        const epochSeconds = (ms) => String(Math.floor((NOW + ms) / 1000));

        it.each([
            [
                'x-ratelimit-reset',
                epochSeconds(90_000),
                90_000,
                'epoch seconds',
            ],
            [
                'x-ratelimit-reset',
                String(NOW + 90_000),
                90_000,
                'epoch milliseconds',
            ],
            ['x-ratelimit-reset', '60', 60_000, 'delta seconds'],
            [
                'x-ratelimit-reset',
                new Date(NOW + 15_000).toISOString(),
                15_000,
                'an ISO timestamp',
            ],
            [
                'x-rate-limit-reset',
                epochSeconds(20_000),
                20_000,
                'epoch seconds (x-rate-limit-reset)',
            ],
            [
                'ratelimit-reset',
                '12',
                12_000,
                'delta seconds (ratelimit-reset)',
            ],
            [
                'x-ratelimit-reset-after',
                '2.5',
                2_500,
                'fractional delta seconds',
            ],
        ])('reads %s = %s as %d ms (%s)', (name, value, waitMs) => {
            expect(parseResetHeaders({ [name]: value }, { now: NOW })).toEqual({
                waitMs,
                retryAt: new Date(NOW + waitMs),
                source: 'header',
            });
        });

        it('waits 0 ms when the reset time is already past', () => {
            const hint = parseResetHeaders(
                { 'x-ratelimit-reset': epochSeconds(-30_000) },
                { now: NOW }
            );
            expect(hint.waitMs).toBe(0);
            expect(hint.retryAt).toEqual(new Date(NOW - 30_000));
        });

        it('prefers reset-after over a reset time', () => {
            const hint = parseResetHeaders(
                {
                    'x-ratelimit-reset': epochSeconds(90_000),
                    'x-ratelimit-reset-after': '3',
                },
                { now: NOW }
            );
            expect(hint.waitMs).toBe(3_000);
        });

        it('carries the remaining count', () => {
            const hint = parseResetHeaders(
                { 'x-ratelimit-reset': '10', 'x-ratelimit-remaining': '0' },
                { now: NOW }
            );
            expect(hint.remaining).toBe(0);
        });

        it('ignores a remaining count that is not a number', () => {
            const hint = parseResetHeaders(
                { 'x-ratelimit-reset': '10', 'x-ratelimit-remaining': 'many' },
                { now: NOW }
            );
            expect(hint.remaining).toBeUndefined();
        });

        it.each([
            ['no reset header', { 'x-ratelimit-remaining': '0' }],
            [
                'a reset value that is not a time',
                { 'x-ratelimit-reset': 'soon' },
            ],
            ['a negative reset value', { 'x-ratelimit-reset': '-4' }],
            ['a reset above the cap', { 'x-ratelimit-reset': '99999999' }],
            ['no headers at all', undefined],
        ])('returns null for %s', (_label, headers) => {
            expect(parseResetHeaders(headers, { now: NOW })).toBeNull();
        });

        it.each([
            [
                'a Headers-like object',
                {
                    get: (n) =>
                        ({ 'x-ratelimit-reset': '30' }[n.toLowerCase()] ??
                        null),
                },
            ],
            ['a Map', new Map([['X-RateLimit-Reset', '30']])],
            ['an entries array', [['X-RateLimit-Reset', '30']]],
            ['a plain object', { 'X-RateLimit-Reset': '30' }],
        ])('finds the header on %s', (_label, headers) => {
            expect(parseResetHeaders(headers, { now: NOW }).waitMs).toBe(
                30_000
            );
        });
    });

    describe('parseIetfRateLimit', () => {
        it('reads the key=value form', () => {
            expect(
                parseIetfRateLimit(
                    { ratelimit: 'limit=100, remaining=0, reset=12' },
                    { now: NOW }
                )
            ).toEqual({
                waitMs: 12_000,
                retryAt: new Date(NOW + 12_000),
                remaining: 0,
                source: 'header',
            });
        });

        it('reads the structured-field form and names the policy', () => {
            expect(
                parseIetfRateLimit(
                    { ratelimit: '"default";r=0;t=12' },
                    { now: NOW }
                )
            ).toEqual({
                waitMs: 12_000,
                retryAt: new Date(NOW + 12_000),
                remaining: 0,
                policy: 'default',
                source: 'header',
            });
        });

        it('picks the exhausted policy of a list', () => {
            const hint = parseIetfRateLimit(
                { ratelimit: '"burst";r=5;t=1, "daily";r=0;t=3600' },
                { now: NOW }
            );
            expect(hint).toMatchObject({
                waitMs: 3_600_000,
                remaining: 0,
                policy: 'daily',
            });
        });

        it('breaks a tie between exhausted policies with the longer wait', () => {
            const hint = parseIetfRateLimit(
                { ratelimit: '"a";r=0;t=5, "b";r=0;t=60' },
                { now: NOW }
            );
            expect(hint).toMatchObject({ waitMs: 60_000, policy: 'b' });
        });

        it('falls back to the RateLimit-Policy value when the limit names no policy', () => {
            const hint = parseIetfRateLimit(
                {
                    ratelimit: 'limit=100, remaining=0, reset=12',
                    'ratelimit-policy': '100;w=60',
                },
                { now: NOW }
            );
            expect(hint.policy).toBe('100;w=60');
        });

        it.each([
            ['no header', {}],
            ['a header with no reset', { ratelimit: 'limit=100, remaining=0' }],
            ['a structured item with no t', { ratelimit: '"default";r=0' }],
            ['garbage', { ratelimit: 'not a rate limit' }],
            [
                'a reset that is not a number',
                { ratelimit: 'limit=1, reset=soon' },
            ],
            ['undefined headers', undefined],
        ])('returns null for %s', (_label, headers) => {
            expect(parseIetfRateLimit(headers, { now: NOW })).toBeNull();
        });
    });

    describe('BUILT_IN_PARSERS', () => {
        it('names the three parsers with one signature', () => {
            expect(Object.keys(BUILT_IN_PARSERS)).toEqual([
                'retryAfter',
                'resetHeaders',
                'ietf',
            ]);
            expect(
                BUILT_IN_PARSERS.retryAfter(
                    { 'retry-after': '4' },
                    { now: NOW }
                ).waitMs
            ).toBe(4_000);
            expect(
                BUILT_IN_PARSERS.resetHeaders(
                    { 'x-ratelimit-reset': '4' },
                    { now: NOW }
                ).waitMs
            ).toBe(4_000);
            expect(
                BUILT_IN_PARSERS.ietf(
                    { ratelimit: '"d";r=0;t=4' },
                    { now: NOW }
                ).waitMs
            ).toBe(4_000);
        });
    });
});
