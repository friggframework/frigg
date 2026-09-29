const {
    DEFAULT_MAX_IN_PROCESS_WAIT_MS,
    DEFAULT_PARSERS,
    JITTER_MAX_MS,
    MIN_HINTED_WAIT_MS,
    classifyRateLimit,
    computeScopeKey,
    computeWaitMs,
    inProcessBudgetMs,
    readRateLimitPolicy,
    resolveRateLimitHint,
} = require('./policy');

const NOW = Date.parse('2026-09-28T12:00:00.000Z');
const options = { now: NOW };

describe('rate-limit/policy', () => {
    it('exposes the defaults', () => {
        expect(DEFAULT_PARSERS).toEqual(['retryAfter', 'resetHeaders', 'ietf']);
        expect(DEFAULT_MAX_IN_PROCESS_WAIT_MS).toBe(300_000);
        expect(MIN_HINTED_WAIT_MS).toBe(1_000);
        expect(JITTER_MAX_MS).toBe(1_000);
    });

    describe('readRateLimitPolicy', () => {
        it('returns undefined when the class declares nothing', () => {
            class Api {}
            expect(readRateLimitPolicy(Api)).toBeUndefined();
        });

        it.each([
            ['a number', 5],
            ['a string', 'fast'],
            ['an array', []],
            ['null', null],
        ])('returns undefined when rateLimit is %s', (_label, value) => {
            class Api {
                static rateLimit = value;
            }
            expect(readRateLimitPolicy(Api)).toBeUndefined();
        });

        it('returns undefined for something that is not a class', () => {
            expect(readRateLimitPolicy(undefined)).toBeUndefined();
            expect(readRateLimitPolicy({ rateLimit: {} })).toBeUndefined();
        });

        it('defaults the scope to entity and the parsers to the built-ins', () => {
            class Api {
                static rateLimit = {};
            }
            expect(readRateLimitPolicy(Api)).toEqual({
                scope: 'entity',
                parsers: DEFAULT_PARSERS,
            });
        });

        it('keeps the known keys and ignores the unknown ones', () => {
            const windows = [{ name: 'burst', limit: 100, perMs: 10_000 }];
            const userHints = { daily: { links: [] } };
            class Api {
                static rateLimit = {
                    scope: 'credential',
                    windows,
                    maxConcurrency: 5,
                    minRetryAfterMs: 60_000,
                    maxInProcessWaitMs: 30_000,
                    parsers: ['retryAfter'],
                    userHints,
                    somethingElse: true,
                };
            }
            const policy = readRateLimitPolicy(Api);
            expect(policy).toMatchObject({
                scope: 'credential',
                windows,
                maxConcurrency: 5,
                minRetryAfterMs: 60_000,
                maxInProcessWaitMs: 30_000,
                parsers: ['retryAfter'],
                userHints,
            });
            expect(policy).not.toHaveProperty('somethingElse');
        });

        it('drops values of the wrong type', () => {
            class Api {
                static rateLimit = {
                    classify: 'nope',
                    minRetryAfterMs: -1,
                    maxInProcessWaitMs: Infinity,
                    maxConcurrency: 1.5,
                    windows: 'many',
                    userHints: 3,
                    scope: 'galaxy',
                };
            }
            expect(readRateLimitPolicy(Api)).toEqual({
                scope: 'entity',
                parsers: DEFAULT_PARSERS,
            });
        });

        it('falls back to the default parsers when parsers is not an array', () => {
            class Api {
                static rateLimit = { parsers: 'retryAfter' };
            }
            expect(readRateLimitPolicy(Api).parsers).toEqual(DEFAULT_PARSERS);
        });

        it('accepts an empty parser list', () => {
            class Api {
                static rateLimit = { parsers: [] };
            }
            expect(readRateLimitPolicy(Api).parsers).toEqual([]);
        });

        it('accepts a function as the scope', () => {
            const scope = () => 'x';
            class Api {
                static rateLimit = { scope };
            }
            expect(readRateLimitPolicy(Api).scope).toBe(scope);
        });

        it('throws a TypeError that names the class and the known parsers', () => {
            class HubApi {
                static rateLimit = { parsers: ['retryAfter', 'magic'] };
            }
            expect(() => readRateLimitPolicy(HubApi)).toThrow(TypeError);
            expect(() => readRateLimitPolicy(HubApi)).toThrow(
                'HubApi.rateLimit.parsers: unknown parser "magic"; known: retryAfter, resetHeaders, ietf'
            );
        });

        it('calls classify as a method of the declared object', () => {
            class Api {
                static rateLimit = {
                    reason: 'burst',
                    classify() {
                        return { reason: this.reason, waitMs: 1_000 };
                    },
                };
            }
            const policy = readRateLimitPolicy(Api);
            expect(policy.classify({ status: 429 })).toEqual({
                reason: 'burst',
                waitMs: 1_000,
            });
        });

        it('is memoized per class and resolved through subclasses', () => {
            class Base {
                static rateLimit = { minRetryAfterMs: 5_000 };
            }
            class Child extends Base {}
            const first = readRateLimitPolicy(Child);
            expect(readRateLimitPolicy(Child)).toBe(first);
            expect(first.minRetryAfterMs).toBe(5_000);
        });
    });

    describe('computeScopeKey', () => {
        const requester = (delegate) => ({
            _telemetryModuleLabel: () => 'hubspot',
            delegate,
        });

        it('keys an entity scope on the entity id, by default', () => {
            const subject = requester({ entity: { id: 7 } });
            expect(computeScopeKey(undefined, subject)).toBe(
                'hubspot:entity:7'
            );
            expect(computeScopeKey({ scope: 'entity' }, subject)).toBe(
                'hubspot:entity:7'
            );
        });

        it('keys a credential scope on the credential id or a string credential', () => {
            expect(
                computeScopeKey(
                    { scope: 'credential' },
                    requester({ credential: { id: 3 } })
                )
            ).toBe('hubspot:credential:3');
            expect(
                computeScopeKey(
                    { scope: 'credential' },
                    requester({ credential: 'c-9' })
                )
            ).toBe('hubspot:credential:c-9');
        });

        it('keys an app scope on the module alone', () => {
            expect(computeScopeKey({ scope: 'app' }, requester({}))).toBe(
                'hubspot:app'
            );
        });

        it('keys a function scope on its result', () => {
            const scope = (subject) => subject.delegate.entity.externalId;
            expect(
                computeScopeKey(
                    { scope },
                    requester({ entity: { externalId: 'portal-1' } })
                )
            ).toBe('hubspot:custom:portal-1');
        });

        it.each([
            ['no entity', { scope: 'entity' }, requester({})],
            ['no credential', { scope: 'credential' }, requester({})],
            ['no delegate', { scope: 'entity' }, requester(undefined)],
            [
                'a function that throws',
                {
                    scope: () => {
                        throw new Error('boom');
                    },
                },
                requester({}),
            ],
            [
                'a function that returns nothing',
                { scope: () => undefined },
                requester({}),
            ],
        ])('returns undefined for %s', (_label, policy, subject) => {
            expect(computeScopeKey(policy, subject)).toBeUndefined();
        });
    });

    describe('classifyRateLimit', () => {
        it('returns null with no policy and no headers', () => {
            expect(
                classifyRateLimit(
                    undefined,
                    { status: 429, headers: {} },
                    options
                )
            ).toBeNull();
        });

        it('reads Retry-After on a 429 with no policy', () => {
            expect(
                classifyRateLimit(
                    undefined,
                    { status: 429, headers: { 'retry-after': '5' } },
                    options
                )
            ).toEqual({
                waitMs: 5_000,
                retryAt: new Date(NOW + 5_000),
                reason: 'unknown',
                source: 'header',
            });
        });

        it('does not read headers on a status other than 429 that nothing classified', () => {
            expect(
                classifyRateLimit(
                    undefined,
                    { status: 503, headers: { 'retry-after': '5' } },
                    options
                )
            ).toBeNull();
            expect(
                classifyRateLimit(
                    { classify: () => null },
                    { status: 403, headers: { 'retry-after': '5' } },
                    options
                )
            ).toBeNull();
        });

        it('takes a classify hint that carries a time, and defaults its source to body', () => {
            const policy = {
                classify: () => ({ reason: 'daily', waitMs: 60_000 }),
            };
            expect(
                classifyRateLimit(policy, { status: 403, headers: {} }, options)
            ).toEqual({
                waitMs: 60_000,
                retryAt: new Date(NOW + 60_000),
                reason: 'daily',
                source: 'body',
            });
        });

        it('keeps a classify retryAt, as a Date, a timestamp or a number', () => {
            const retryAt = new Date(NOW + 3_600_000);
            for (const value of [
                retryAt,
                retryAt.toISOString(),
                retryAt.getTime(),
            ]) {
                const policy = {
                    classify: () => ({ reason: 'daily', retryAt: value }),
                };
                const hint = classifyRateLimit(
                    policy,
                    { status: 429, headers: {} },
                    options
                );
                expect(hint.waitMs).toBe(3_600_000);
                expect(hint.retryAt).toEqual(retryAt);
            }
        });

        it('keeps the source classify gives, when it is a known one', () => {
            const build = (source) => ({
                classify: () => ({ waitMs: 1_000, source }),
            });
            const signal = { status: 429, headers: {} };
            expect(
                classifyRateLimit(build('static'), signal, options).source
            ).toBe('static');
            expect(
                classifyRateLimit(build('backoff'), signal, options).source
            ).toBe('body');
        });

        it('lets a classify time win over Retry-After', () => {
            const policy = {
                classify: () => ({ reason: 'daily', waitMs: 60_000 }),
            };
            const hint = classifyRateLimit(
                policy,
                { status: 429, headers: { 'retry-after': '2' } },
                options
            );
            expect(hint.waitMs).toBe(60_000);
        });

        it('takes the time of a reason-only classify from the first parser', () => {
            const policy = {
                classify: () => ({ reason: 'burst', policy: 'SECONDLY' }),
            };
            expect(
                classifyRateLimit(
                    policy,
                    { status: 429, headers: { 'retry-after': '7' } },
                    options
                )
            ).toEqual({
                waitMs: 7_000,
                retryAt: new Date(NOW + 7_000),
                reason: 'burst',
                policy: 'SECONDLY',
                source: 'header',
            });
        });

        it('takes the time of a reason-only classify from the window when no header helps', () => {
            const policy = {
                windows: [{ name: 'burst', limit: 110, perMs: 10_000 }],
                classify: () => ({ reason: 'burst' }),
            };
            expect(
                classifyRateLimit(policy, { status: 429, headers: {} }, options)
            ).toEqual({
                waitMs: 10_000,
                retryAt: new Date(NOW + 10_000),
                reason: 'burst',
                source: 'static',
            });
        });

        it('returns null for a reason-only classify with no time anywhere', () => {
            const policy = { classify: () => ({ reason: 'daily' }) };
            expect(
                classifyRateLimit(policy, { status: 403, headers: {} }, options)
            ).toBeNull();
        });

        it('treats a classify time that is not valid as no time', () => {
            const policy = {
                classify: () => ({ reason: 'daily', waitMs: -5 }),
            };
            expect(
                classifyRateLimit(policy, { status: 403, headers: {} }, options)
            ).toBeNull();
        });

        it('turns a static minRetryAfterMs into the hint of a bare 429', () => {
            expect(
                classifyRateLimit(
                    { minRetryAfterMs: 60_000 },
                    { status: 429, headers: {} },
                    options
                )
            ).toEqual({
                waitMs: 60_000,
                retryAt: new Date(NOW + 60_000),
                reason: 'unknown',
                source: 'static',
            });
        });

        it('reads the parsers in the order the policy lists them', () => {
            const headers = { 'retry-after': '5', 'x-ratelimit-reset': '30' };
            const signal = { status: 429, headers };
            expect(
                classifyRateLimit(
                    { parsers: ['resetHeaders', 'retryAfter'] },
                    signal,
                    options
                ).waitMs
            ).toBe(30_000);
            expect(classifyRateLimit(undefined, signal, options).waitMs).toBe(
                5_000
            );
        });

        it('does not use a parser the policy leaves out', () => {
            expect(
                classifyRateLimit(
                    { parsers: ['retryAfter'] },
                    { status: 429, headers: { 'x-ratelimit-reset': '30' } },
                    options
                )
            ).toBeNull();
        });

        it('carries remaining and policy from a parser', () => {
            const hint = classifyRateLimit(
                undefined,
                {
                    status: 429,
                    headers: { ratelimit: '"daily";r=0;t=3600' },
                },
                options
            );
            expect(hint).toMatchObject({
                remaining: 0,
                policy: 'daily',
                waitMs: 3_600_000,
            });
        });

        it('turns a reason it does not know into unknown', () => {
            const policy = {
                classify: () => ({ reason: 'hourly', waitMs: 1_000 }),
            };
            expect(
                classifyRateLimit(policy, { status: 429, headers: {} }, options)
                    .reason
            ).toBe('unknown');
        });

        it('hands classify the status, the headers and the body', () => {
            const classify = jest.fn(() => null);
            const headers = { 'x-a': '1' };
            const body = { code: 'LIMIT' };
            classifyRateLimit(
                { classify },
                { status: 403, headers, body },
                options
            );
            expect(classify).toHaveBeenCalledWith({
                status: 403,
                headers,
                body,
            });
        });

        it('lets a throwing classify propagate when nobody listens', () => {
            const policy = {
                classify: () => {
                    throw new Error('bad classifier');
                },
            };
            expect(() =>
                classifyRateLimit(policy, { status: 429, headers: {} }, options)
            ).toThrow('bad classifier');
        });

        it('reports a throwing classify and goes on with the parsers', () => {
            const error = new Error('bad classifier');
            const policy = {
                classify: () => {
                    throw error;
                },
            };
            const onClassifyError = jest.fn();
            const hint = classifyRateLimit(
                policy,
                { status: 429, headers: { 'retry-after': '4' } },
                { ...options, onClassifyError }
            );
            expect(onClassifyError).toHaveBeenCalledWith(error);
            expect(hint.waitMs).toBe(4_000);
        });

        it.each([
            ['an empty object', {}],
            ['an undefined reason', { reason: undefined }],
            ['a reason it does not know', { reason: 'hourly' }],
            ['only a policy name', { policy: 'DAILY' }],
            ['a retryAt that is not a date', { retryAt: 'soon' }],
            ['a waitMs that is not a number', { waitMs: '5000' }],
        ])('treats %s from classify as no limit', (_label, result) => {
            const policy = { classify: () => result };
            expect(
                classifyRateLimit(
                    policy,
                    { status: 404, headers: { 'retry-after': '5' } },
                    options
                )
            ).toBeNull();
            expect(
                resolveRateLimitHint(
                    policy,
                    { status: 404, headers: {} },
                    { ...options, attempt: 0, backOff: [1] }
                )
            ).toBeNull();
        });

        it.each([
            ['a finite waitMs', { waitMs: 2_000 }, 2_000],
            ['a valid retryAt', { retryAt: new Date(NOW + 3_000) }, 3_000],
        ])(
            'counts a classify result with %s and no reason as a limit',
            (_label, result, waitMs) => {
                expect(
                    classifyRateLimit(
                        { classify: () => result },
                        { status: 404, headers: {} },
                        options
                    )
                ).toMatchObject({ waitMs, reason: 'unknown', source: 'body' });
            }
        );

        it('reports a classify that returns a Promise and goes on with the parsers', () => {
            const onClassifyError = jest.fn();
            const policy = {
                classify: async () => ({ reason: 'daily', waitMs: 60_000 }),
            };
            const hint = classifyRateLimit(
                policy,
                { status: 429, headers: { 'retry-after': '4' } },
                { ...options, onClassifyError }
            );
            expect(onClassifyError).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'TypeError',
                    message:
                        'classify() must return a hint or null, not a Promise',
                })
            );
            expect(hint).toMatchObject({
                waitMs: 4_000,
                reason: 'unknown',
                source: 'header',
            });
        });

        it('treats a classify that returns a Promise as no limit for a status other than 429', () => {
            const policy = { classify: async () => ({ reason: 'daily' }) };
            const onClassifyError = jest.fn();
            expect(
                classifyRateLimit(
                    policy,
                    { status: 404, headers: {} },
                    { ...options, onClassifyError }
                )
            ).toBeNull();
            expect(onClassifyError).toHaveBeenCalledTimes(1);
        });

        it('lets the Promise error propagate when nobody listens', () => {
            expect(() =>
                classifyRateLimit(
                    { classify: async () => null },
                    { status: 429, headers: {} },
                    options
                )
            ).toThrow(TypeError);
        });

        it('handles the rejection of a Promise that classify returns', async () => {
            const then = jest.fn();
            classifyRateLimit(
                { classify: () => ({ then }) },
                { status: 429, headers: {} },
                { ...options, onClassifyError: () => {} }
            );
            await Promise.resolve();
            expect(then).toHaveBeenCalledWith(
                expect.any(Function),
                expect.any(Function)
            );
        });

        it('accepts the policy object a module declares, without reading it first', () => {
            const declared = {
                parsers: ['retryAfter'],
                classify: () => ({ reason: 'daily', waitMs: 1_000 }),
            };
            expect(
                classifyRateLimit(
                    declared,
                    { status: undefined, headers: {} },
                    options
                ).reason
            ).toBe('daily');
        });
    });

    describe('resolveRateLimitHint', () => {
        const backOff = [1, 3, 10];

        it('returns the hint when there is one', () => {
            const hint = resolveRateLimitHint(
                undefined,
                { status: 429, headers: { 'retry-after': '9' } },
                { ...options, attempt: 0, backOff }
            );
            expect(hint).toMatchObject({ waitMs: 9_000, source: 'header' });
        });

        it('falls back to the ladder step with source backoff', () => {
            const hint = resolveRateLimitHint(
                undefined,
                { status: 429, headers: {} },
                { ...options, attempt: 2, backOff }
            );
            expect(hint).toEqual({
                waitMs: 10_000,
                retryAt: new Date(NOW + 10_000),
                reason: 'unknown',
                source: 'backoff',
            });
        });

        it('returns null for a status other than 429 that classify did not recognise', () => {
            expect(
                resolveRateLimitHint(
                    { classify: () => null },
                    { status: 403, headers: { 'retry-after': '5' } },
                    { ...options, attempt: 0, backOff }
                )
            ).toBeNull();
            expect(
                resolveRateLimitHint(
                    undefined,
                    { status: 503, headers: {} },
                    { ...options, attempt: 0, backOff }
                )
            ).toBeNull();
        });

        it('falls back to the ladder for a status other than 429 that classify named by reason only', () => {
            const policy = {
                classify: () => ({ reason: 'daily', policy: 'DAILY' }),
            };
            expect(
                resolveRateLimitHint(
                    policy,
                    { status: 403, headers: {} },
                    { ...options, attempt: 1, backOff }
                )
            ).toEqual({
                waitMs: 3_000,
                retryAt: new Date(NOW + 3_000),
                reason: 'daily',
                policy: 'DAILY',
                source: 'backoff',
            });
        });

        it('waits 0 ms past the end of the ladder', () => {
            const hint = resolveRateLimitHint(
                undefined,
                { status: 429, headers: {} },
                { ...options, attempt: 3, backOff }
            );
            expect(hint).toMatchObject({ waitMs: 0, source: 'backoff' });
        });

        it('keeps the reason and policy of a reason-only classify in the fallback', () => {
            const policy = {
                classify: () => ({ reason: 'daily', policy: 'DAILY' }),
            };
            const hint = resolveRateLimitHint(
                policy,
                { status: 429, headers: {} },
                { ...options, attempt: 0, backOff }
            );
            expect(hint).toMatchObject({
                reason: 'daily',
                policy: 'DAILY',
                source: 'backoff',
                waitMs: 1_000,
            });
        });

        it('reports a throwing classify and still answers', () => {
            const onClassifyError = jest.fn();
            const policy = {
                classify: () => {
                    throw new Error('boom');
                },
            };
            const hint = resolveRateLimitHint(
                policy,
                { status: 429, headers: {} },
                { ...options, attempt: 0, backOff, onClassifyError }
            );
            expect(onClassifyError).toHaveBeenCalledTimes(1);
            expect(hint.source).toBe('backoff');
        });
    });

    describe('computeWaitMs', () => {
        const hintOf = (waitMs) => ({
            waitMs,
            retryAt: new Date(NOW + waitMs),
            source: 'header',
        });
        const noJitter = () => 0;
        const maxJitter = () => 0.999999;

        it('waits as long as the hint says', () => {
            expect(
                computeWaitMs({
                    hint: hintOf(5_000),
                    budgetMs: 300_000,
                    random: noJitter,
                })
            ).toEqual({ waitMs: 5_000, fits: true });
        });

        it('applies minRetryAfterMs as a floor', () => {
            expect(
                computeWaitMs({
                    hint: hintOf(5_000),
                    policy: { minRetryAfterMs: 60_000 },
                    budgetMs: 300_000,
                    random: noJitter,
                }).waitMs
            ).toBe(60_000);
        });

        it('applies the minimum wait', () => {
            expect(
                computeWaitMs({
                    hint: hintOf(0),
                    budgetMs: 300_000,
                    random: noJitter,
                }).waitMs
            ).toBe(MIN_HINTED_WAIT_MS);
        });

        it('adds jitter of at most 10 percent of the wait, and at most 1 s', () => {
            expect(
                computeWaitMs({
                    hint: hintOf(5_000),
                    budgetMs: 300_000,
                    random: maxJitter,
                }).waitMs
            ).toBe(5_499);
            expect(
                computeWaitMs({
                    hint: hintOf(60_000),
                    budgetMs: 300_000,
                    random: maxJitter,
                }).waitMs
            ).toBe(60_999);
        });

        it('never lets jitter push a wait over the budget', () => {
            expect(
                computeWaitMs({
                    hint: hintOf(5_000),
                    budgetMs: 5_100,
                    random: maxJitter,
                })
            ).toEqual({ waitMs: 5_100, fits: true });
        });

        it('fits a wait that equals the budget', () => {
            expect(
                computeWaitMs({
                    hint: hintOf(5_000),
                    budgetMs: 5_000,
                    random: maxJitter,
                })
            ).toEqual({ waitMs: 5_000, fits: true });
        });

        it('reports that a wait over the budget does not fit, with no jitter', () => {
            expect(
                computeWaitMs({
                    hint: hintOf(5_000),
                    budgetMs: 4_000,
                    random: maxJitter,
                })
            ).toEqual({ waitMs: 5_000, fits: false });
        });

        it('uses Math.random when no source of randomness is given', () => {
            const { waitMs } = computeWaitMs({
                hint: hintOf(5_000),
                budgetMs: 300_000,
            });
            expect(waitMs).toBeGreaterThanOrEqual(5_000);
            expect(waitMs).toBeLessThan(5_500);
        });
    });

    describe('inProcessBudgetMs', () => {
        it('defaults the cap to 5 minutes', () => {
            expect(
                inProcessBudgetMs({
                    requestTimeoutMs: 0,
                    remainingMs: Infinity,
                    waitedMs: 0,
                })
            ).toBe(300_000);
        });

        it('lets the policy override the cap', () => {
            expect(
                inProcessBudgetMs({
                    policy: { maxInProcessWaitMs: 30_000 },
                    remainingMs: Infinity,
                })
            ).toBe(30_000);
            expect(
                inProcessBudgetMs({
                    policy: { maxInProcessWaitMs: 0 },
                    remainingMs: Infinity,
                })
            ).toBe(0);
        });

        it('subtracts the wait already spent', () => {
            expect(
                inProcessBudgetMs({ remainingMs: Infinity, waitedMs: 100_000 })
            ).toBe(200_000);
        });

        it('keeps one request timeout of the time left for the next request', () => {
            expect(
                inProcessBudgetMs({
                    requestTimeoutMs: 30_000,
                    remainingMs: 100_000,
                })
            ).toBe(70_000);
        });

        it('keeps at most half of the time left for the next request', () => {
            expect(
                inProcessBudgetMs({
                    requestTimeoutMs: 60_000,
                    remainingMs: 29_000,
                })
            ).toBe(14_500);
        });

        it('is the cap when the invocation has time to spare', () => {
            expect(
                inProcessBudgetMs({
                    requestTimeoutMs: 60_000,
                    remainingMs: 900_000,
                })
            ).toBe(300_000);
        });

        it('is never negative', () => {
            expect(
                inProcessBudgetMs({
                    requestTimeoutMs: 60_000,
                    remainingMs: 0,
                })
            ).toBe(0);
            expect(
                inProcessBudgetMs({ remainingMs: Infinity, waitedMs: 400_000 })
            ).toBe(0);
        });

        it('treats a missing request timeout as 0', () => {
            expect(inProcessBudgetMs({ remainingMs: 50_000 })).toBe(50_000);
            expect(
                inProcessBudgetMs({
                    requestTimeoutMs: null,
                    remainingMs: 50_000,
                })
            ).toBe(50_000);
        });
    });
});
