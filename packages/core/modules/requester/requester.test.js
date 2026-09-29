const { Headers } = require('node-fetch');
const { Requester } = require('./requester');
const { FetchError, RateLimitError } = require('../../errors');
const { createMemorySink } = require('../../logs');
const {
    runWithInvocationDeadline,
} = require('../../core/invocation-deadline');

/**
 * Requester is abstract: subclasses provide `addAuthHeaders`. For the
 * timeout / retry tests we don't care about auth headers, so this
 * subclass just passes them through.
 */
class TestRequester extends Requester {
    async addAuthHeaders(headers) {
        return headers;
    }
}

/**
 * Fetch double that honors the AbortSignal: rejects with an AbortError when
 * the signal fires, otherwise never resolves (simulating a hung upstream).
 * Lets jest's fake-timer machinery drive the abort.
 */
function hangingFetch() {
    return jest.fn((_url, options) => {
        return new Promise((_resolve, reject) => {
            if (!options?.signal) return; // disabled-timeout path
            options.signal.addEventListener('abort', () => {
                const err = new Error('The user aborted a request.');
                err.name = 'AbortError';
                reject(err);
            });
        });
    });
}

function okFetch(body) {
    const resolvedBody = body === undefined ? { ok: true } : body;
    return jest.fn().mockResolvedValue({
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => resolvedBody,
    });
}

describe('Requester', () => {
    describe('rate-limit handling', () => {
        const url = 'https://example.com/limited';
        const LADDER_MS = [1_000, 3_000, 10_000, 30_000, 60_000, 180_000];

        function throttledFetch(responses) {
            const queue = [...responses];
            const built = [];
            const fetch = jest.fn(async () => {
                const next = queue.shift();
                if (!next) throw new Error('unexpected fetch call');
                if (next.reject) throw next.reject;
                const contentType = next.contentType ?? 'application/json';
                const text = next.text ?? JSON.stringify(next.body ?? {});
                const response = {
                    status: next.status,
                    bodyUsed: false,
                    headers:
                        next.headersObject ??
                        new Map(
                            Object.entries({
                                'Content-Type': contentType,
                                ...(next.headers ?? {}),
                            })
                        ),
                    json: async () => next.body ?? {},
                    text: jest.fn(async () => text),
                };
                built.push(response);
                return response;
            });
            fetch.responses = built;
            return fetch;
        }

        const limited = (headers, extra = {}) => ({
            status: 429,
            headers,
            ...extra,
        });
        const ok = { status: 200, body: { ok: true } };

        let delays;
        let sink;

        beforeEach(() => {
            delays = [];
            const realSetTimeout = global.setTimeout;
            jest.spyOn(global, 'setTimeout').mockImplementation(
                (fn, delay, ...args) => {
                    delays.push(delay);
                    return realSetTimeout(fn, 0, ...args);
                }
            );
            sink = createMemorySink();
        });

        afterEach(() => jest.restoreAllMocks());

        function makeRequester(
            fetch,
            params = {},
            RequesterClass = TestRequester
        ) {
            return new RequesterClass({
                fetch,
                requestTimeoutMs: 0,
                random: () => 0,
                ...params,
            });
        }

        const withPolicy = (rateLimit) => {
            class PolicyRequester extends TestRequester {
                static rateLimit = rateLimit;
            }
            return PolicyRequester;
        };

        describe('a module that declares nothing', () => {
            it('retries a bare 429 on the fixed ladder, then throws a plain FetchError', async () => {
                const fetch = throttledFetch(Array(7).fill(limited()));
                const requester = makeRequester(fetch);

                const error = await requester._get({ url }).catch((e) => e);

                expect(error).toBeInstanceOf(FetchError);
                expect(error).not.toBeInstanceOf(RateLimitError);
                expect(error.isRateLimited).toBeUndefined();
                expect(error.statusCode).toBe(429);
                expect(delays).toEqual(LADDER_MS);
                expect(fetch).toHaveBeenCalledTimes(7);
            });

            it('keeps the ladder inside a short invocation, because only hinted waits are budgeted', async () => {
                const fetch = throttledFetch(Array(7).fill(limited()));
                const requester = makeRequester(fetch, {
                    requestTimeoutMs: 45_000,
                });

                const error = await runWithInvocationDeadline(
                    Date.now() + 29_000,
                    () => requester._get({ url }).catch((e) => e)
                );

                expect(error).toBeInstanceOf(FetchError);
                expect(delays.filter((delay) => delay !== 45_000)).toEqual(
                    LADDER_MS
                );
                expect(fetch).toHaveBeenCalledTimes(7);
            });

            it('leaves the 5xx ladder alone', async () => {
                const fetch = throttledFetch([
                    { status: 500 },
                    { status: 500 },
                    ok,
                ]);
                const result = await makeRequester(fetch)._get({ url });

                expect(result).toEqual({ ok: true });
                expect(delays).toEqual([1_000, 3_000]);
            });

            it('keeps the ladder for a 503 that carries Retry-After', async () => {
                const fetch = throttledFetch([
                    { status: 503, headers: { 'Retry-After': '30' } },
                    ok,
                ]);
                await makeRequester(fetch)._get({ url });

                expect(delays).toEqual([1_000]);
            });

            it('writes no rate-limit record for the ladder', async () => {
                const fetch = throttledFetch([limited(), ok]);
                await makeRequester(fetch)._get({ url });

                expect(
                    sink.records.filter((r) =>
                        r.eventName?.endsWith('.rate_limited')
                    )
                ).toEqual([]);
            });
        });

        describe('Retry-After', () => {
            it('waits as long as the header says, not one ladder step', async () => {
                const fetch = throttledFetch([
                    limited({ 'Retry-After': '5' }),
                    ok,
                ]);
                const result = await makeRequester(fetch)._get({ url });

                expect(result).toEqual({ ok: true });
                expect(delays).toEqual([5_000]);
                expect(fetch).toHaveBeenCalledTimes(2);
            });

            it('does not raise a short Retry-After to the ladder step of a later attempt', async () => {
                const fetch = throttledFetch([
                    limited(),
                    limited(),
                    limited({ 'Retry-After': '2' }),
                    ok,
                ]);
                await makeRequester(fetch)._get({ url });

                expect(delays).toEqual([1_000, 3_000, 2_000]);
            });

            it('reads the header from a real Headers object', async () => {
                const fetch = throttledFetch([
                    limited(undefined, {
                        headersObject: new Headers({ 'retry-after': '3' }),
                    }),
                    ok,
                ]);
                await makeRequester(fetch)._get({ url });

                expect(delays).toEqual([3_000]);
            });

            it('adds jitter that never passes the wait by more than a tenth', async () => {
                const fetch = throttledFetch([
                    limited({ 'Retry-After': '60' }),
                    ok,
                ]);
                await makeRequester(fetch, { random: () => 0.999999 })._get({
                    url,
                });

                expect(delays).toEqual([60_999]);
            });

            it('sleeps on for hinted 429s beyond the length of the ladder', async () => {
                const fetch = throttledFetch([
                    ...Array(8).fill(limited({ 'Retry-After': '1' })),
                    ok,
                ]);
                const result = await makeRequester(fetch)._get({ url });

                expect(result).toEqual({ ok: true });
                expect(delays).toEqual(Array(8).fill(1_000));
                expect(fetch).toHaveBeenCalledTimes(9);
            });

            it('throws a RateLimitError with retryAt when the wait is over the cap', async () => {
                const fetch = throttledFetch([
                    limited({ 'Retry-After': '400' }),
                    ok,
                ]);
                const before = Date.now();

                const error = await makeRequester(fetch)
                    ._get({ url })
                    .catch((e) => e);

                expect(error).toBeInstanceOf(RateLimitError);
                expect(error).toBeInstanceOf(FetchError);
                expect(error).toMatchObject({
                    isRateLimited: true,
                    statusCode: 429,
                    source: 'header',
                    waitMs: 400_000,
                    reason: 'unknown',
                });
                expect(error.retryAt.getTime()).toBeGreaterThanOrEqual(
                    before + 400_000
                );
                expect(fetch).toHaveBeenCalledTimes(1);
                expect(delays).toEqual([]);
            });

            it('stops sleeping once the waits add up to the cap', async () => {
                const fetch = throttledFetch([
                    ...Array(4).fill(limited({ 'Retry-After': '100' })),
                    ok,
                ]);

                const error = await makeRequester(fetch)
                    ._get({ url })
                    .catch((e) => e);

                expect(error).toBeInstanceOf(RateLimitError);
                expect(delays).toEqual([100_000, 100_000, 100_000]);
                expect(fetch).toHaveBeenCalledTimes(4);
            });

            it('counts a hinted wait against the cap across a 5xx retry', async () => {
                const fetch = throttledFetch([
                    limited({ 'Retry-After': '200' }),
                    { status: 500 },
                    limited({ 'Retry-After': '200' }),
                    ok,
                ]);

                const error = await makeRequester(fetch)
                    ._get({ url })
                    .catch((e) => e);

                expect(error).toBeInstanceOf(RateLimitError);
                expect(delays).toEqual([200_000, 3_000]);
                expect(fetch).toHaveBeenCalledTimes(3);
            });

            it('counts a hinted wait against the cap across a connection reset', async () => {
                const reset = Object.assign(new Error('socket hang up'), {
                    code: 'ECONNRESET',
                });
                const fetch = throttledFetch([
                    limited({ 'Retry-After': '200' }),
                    { reject: reset },
                    limited({ 'Retry-After': '200' }),
                    ok,
                ]);

                const error = await makeRequester(fetch)
                    ._get({ url })
                    .catch((e) => e);

                expect(error).toBeInstanceOf(RateLimitError);
                expect(delays).toEqual([200_000, 3_000]);
            });

            it('sleeps a short wait inside an invocation shorter than the default request timeout', async () => {
                const fetch = throttledFetch([
                    limited({ 'Retry-After': '2' }),
                    ok,
                ]);
                const requester = makeRequester(fetch, {
                    requestTimeoutMs: undefined,
                });

                const result = await runWithInvocationDeadline(
                    Date.now() + 29_000,
                    () => requester._get({ url })
                );

                expect(requester.requestTimeoutMs).toBe(60_000);
                expect(result).toEqual({ ok: true });
                expect(delays.filter((delay) => delay !== 60_000)).toEqual([
                    2_000,
                ]);
                expect(fetch).toHaveBeenCalledTimes(2);
            });

            it('throws at once when the wait does not fit the time left in the invocation', async () => {
                const fetch = throttledFetch([
                    limited({ 'Retry-After': '5' }),
                    ok,
                ]);
                const requester = makeRequester(fetch, {
                    requestTimeoutMs: 5_000,
                });

                const error = await runWithInvocationDeadline(
                    Date.now() + 8_000,
                    () => requester._get({ url }).catch((e) => e)
                );

                expect(error).toBeInstanceOf(RateLimitError);
                expect(fetch).toHaveBeenCalledTimes(1);
            });

            it('throws at once when the policy allows no in-process wait', async () => {
                const Api = withPolicy({ maxInProcessWaitMs: 0 });
                const fetch = throttledFetch([
                    limited({ 'Retry-After': '2' }),
                    ok,
                ]);

                const error = await makeRequester(fetch, {}, Api)
                    ._get({ url })
                    .catch((e) => e);

                expect(error).toBeInstanceOf(RateLimitError);
                expect(fetch).toHaveBeenCalledTimes(1);
            });

            it('reads the body of the RateLimitError once', async () => {
                const fetch = throttledFetch([
                    limited(
                        { 'Retry-After': '400' },
                        { body: { message: 'slow down' } }
                    ),
                ]);
                const error = await makeRequester(fetch)
                    ._get({ url })
                    .catch((e) => e);

                expect(fetch.responses[0].text).toHaveBeenCalledTimes(1);
                expect(error.body).toContain('slow down');
            });
        });

        describe('static rateLimit', () => {
            it('makes minRetryAfterMs the wait of a bare 429', async () => {
                const Api = withPolicy({ minRetryAfterMs: 60_000 });
                const fetch = throttledFetch([limited(), ok]);
                await makeRequester(fetch, {}, Api)._get({ url });

                expect(delays).toEqual([60_000]);
            });

            it('makes minRetryAfterMs the floor of a shorter Retry-After', async () => {
                const Api = withPolicy({ minRetryAfterMs: 60_000 });
                const fetch = throttledFetch([
                    limited({ 'Retry-After': '5' }),
                    ok,
                ]);
                await makeRequester(fetch, {}, Api)._get({ url });

                expect(delays).toEqual([60_000]);
            });

            it('reads only the parsers it lists, in that order', async () => {
                const Api = withPolicy({
                    parsers: ['resetHeaders', 'retryAfter'],
                });
                const fetch = throttledFetch([
                    limited({ 'Retry-After': '2', 'X-RateLimit-Reset': '7' }),
                    ok,
                ]);
                await makeRequester(fetch, {}, Api)._get({ url });

                expect(delays).toEqual([7_000]);
            });

            it('carries the module name and the scope key on the error', async () => {
                const Api = withPolicy({ scope: 'entity' });
                const fetch = throttledFetch([
                    limited({ 'Retry-After': '400' }),
                ]);
                const requester = makeRequester(
                    fetch,
                    { delegate: { name: 'hubspot', entity: { id: 7 } } },
                    Api
                );

                const error = await requester._get({ url }).catch((e) => e);

                expect(error).toMatchObject({
                    module: 'hubspot',
                    scopeKey: 'hubspot:entity:7',
                });
            });

            it('fails at construction for a parser that does not exist', () => {
                const Api = withPolicy({ parsers: ['magic'] });
                expect(() => new Api({})).toThrow(TypeError);
            });
        });

        describe('classify', () => {
            it('treats a 403 as throttled and retries when the wait fits', async () => {
                const classify = jest.fn(({ status, body }) =>
                    status === 403 && body?.code === 'LIMIT'
                        ? { reason: 'daily', waitMs: 2_000 }
                        : null
                );
                const Api = withPolicy({ classify });
                const fetch = throttledFetch([
                    { status: 403, body: { code: 'LIMIT' } },
                    ok,
                ]);

                const result = await makeRequester(fetch, {}, Api)._get({
                    url,
                });

                expect(result).toEqual({ ok: true });
                expect(delays).toEqual([2_000]);
                expect(classify).toHaveBeenCalledWith(
                    expect.objectContaining({
                        status: 403,
                        body: { code: 'LIMIT' },
                    })
                );
            });

            it('throws a RateLimitError with the 403 status when the wait does not fit', async () => {
                const Api = withPolicy({
                    classify: () => ({ reason: 'daily', waitMs: 400_000 }),
                });
                const fetch = throttledFetch([
                    { status: 403, body: { code: 'LIMIT' } },
                ]);

                const error = await makeRequester(fetch, {}, Api)
                    ._get({ url })
                    .catch((e) => e);

                expect(error).toBeInstanceOf(RateLimitError);
                expect(error).toMatchObject({
                    statusCode: 403,
                    reason: 'daily',
                    source: 'body',
                });
                expect(fetch.responses[0].text).toHaveBeenCalledTimes(1);
                expect(error.body).toContain('LIMIT');
            });

            it('leaves a 403 that classify does not recognise as a plain FetchError', async () => {
                const Api = withPolicy({ classify: () => null });
                const fetch = throttledFetch([
                    { status: 403, headers: { 'Retry-After': '2' } },
                ]);

                const error = await makeRequester(fetch, {}, Api)
                    ._get({ url })
                    .catch((e) => e);

                expect(error).toBeInstanceOf(FetchError);
                expect(error.isRateLimited).toBeUndefined();
                expect(fetch).toHaveBeenCalledTimes(1);
                expect(delays).toEqual([]);
            });

            it('treats a 403 that classify names by reason only like a bare 429: the ladder, then a flagged FetchError', async () => {
                const Api = withPolicy({
                    classify: () => ({ reason: 'daily' }),
                });
                const fetch = throttledFetch(
                    Array(3).fill({ status: 403, body: { code: 'LIMIT' } })
                );

                const error = await makeRequester(
                    fetch,
                    { backOff: [0, 0] },
                    Api
                )
                    ._get({ url })
                    .catch((e) => e);

                expect(error).toBeInstanceOf(FetchError);
                expect(error).not.toBeInstanceOf(RateLimitError);
                expect(error).toMatchObject({
                    statusCode: 403,
                    isRateLimited: true,
                    reason: 'daily',
                });
                expect(error.retryAt).toBeUndefined();
                expect(fetch).toHaveBeenCalledTimes(3);
                expect(delays).toEqual([0, 0]);
            });

            it.each([
                'application/problem+json',
                'Application/JSON; charset=utf-8',
                'application/vnd.api+json',
                'application/hal+json',
                'text/json',
            ])(
                'hands classify the parsed body of a %s response',
                async (contentType) => {
                    const classify = jest.fn(() => ({
                        reason: 'burst',
                        waitMs: 1_000,
                    }));
                    const Api = withPolicy({ classify });
                    const fetch = throttledFetch([
                        { status: 403, contentType, body: { code: 'LIMIT' } },
                        ok,
                    ]);

                    await makeRequester(fetch, {}, Api)._get({ url });

                    expect(classify.mock.calls[0][0].body).toEqual({
                        code: 'LIMIT',
                    });
                }
            );

            it.each(['text/plain', 'application/xml', 'application/jsonp'])(
                'hands classify no body for a %s response',
                async (contentType) => {
                    const classify = jest.fn(() => ({
                        reason: 'burst',
                        waitMs: 1_000,
                    }));
                    const Api = withPolicy({ classify });
                    const fetch = throttledFetch([
                        { status: 403, contentType, text: '{"code":"LIMIT"}' },
                        ok,
                    ]);

                    await makeRequester(fetch, {}, Api)._get({ url });

                    expect(classify.mock.calls[0][0].body).toBeUndefined();
                }
            );

            it('takes the time of a reason-only classify from Retry-After', async () => {
                const Api = withPolicy({
                    classify: () => ({ reason: 'burst' }),
                });
                const fetch = throttledFetch([
                    limited({ 'Retry-After': '400' }),
                ]);

                const error = await makeRequester(fetch, {}, Api)
                    ._get({ url })
                    .catch((e) => e);

                expect(error).toMatchObject({
                    reason: 'burst',
                    source: 'header',
                });
            });

            it('hands classify an undefined body when the response is not JSON', async () => {
                const classify = jest.fn(() => ({
                    reason: 'burst',
                    waitMs: 1_000,
                }));
                const Api = withPolicy({ classify });
                const fetch = throttledFetch([
                    limited(undefined, {
                        contentType: 'text/plain',
                        text: 'slow down',
                    }),
                    ok,
                ]);

                await makeRequester(fetch, {}, Api)._get({ url });

                expect(classify.mock.calls[0][0].body).toBeUndefined();
            });

            it('does not call classify for a success or for a 401', async () => {
                const classify = jest.fn(() => null);
                const Api = withPolicy({ classify });
                const fetch = throttledFetch([{ status: 401 }, ok]);
                const requester = makeRequester(fetch, { backOff: [0] }, Api);
                requester.notify = jest.fn();

                await requester._get({ url });

                expect(classify).not.toHaveBeenCalled();
            });

            it('writes one WARN record and goes on with the parsers when classify throws', async () => {
                const Api = withPolicy({
                    classify: () => {
                        throw new Error('bad classifier');
                    },
                });
                const fetch = throttledFetch([
                    limited({ 'Retry-After': '2' }),
                    ok,
                ]);

                await makeRequester(fetch, {}, Api)._get({ url });

                expect(delays).toEqual([2_000]);
                expect(
                    sink.records.filter(
                        (r) =>
                            r.eventName ===
                            'module.PolicyRequester.rate_limit_classify_failed'
                    )
                ).toEqual([
                    expect.objectContaining({
                        level: 'WARN',
                        statusCode: 429,
                        error: expect.objectContaining({
                            message: 'bad classifier',
                        }),
                    }),
                ]);
            });
        });

        describe('logging', () => {
            it('writes one TRACE record for a wait that a header set', async () => {
                const fetch = throttledFetch([
                    limited({ 'Retry-After': '5' }),
                    ok,
                ]);
                await makeRequester(fetch)._get({ url });

                const records = sink.records.filter(
                    (r) => r.eventName === 'module.TestRequester.rate_limited'
                );
                expect(records).toEqual([
                    expect.objectContaining({
                        level: 'TRACE',
                        logger: 'module.TestRequester',
                        statusCode: 429,
                        waitMs: 5_000,
                        reason: 'unknown',
                        hintSource: 'header',
                        attempt: 0,
                        waitedMs: 0,
                        retryAt: expect.any(String),
                    }),
                ]);
                expect(records[0]).not.toHaveProperty('action');
            });

            it('writes no rate-limit record for the error it throws', async () => {
                const fetch = throttledFetch([
                    limited({ 'Retry-After': '400' }),
                ]);
                const error = await makeRequester(fetch)
                    ._get({ url })
                    .catch((e) => e);

                expect(error).toBeInstanceOf(RateLimitError);
                expect(
                    sink.records.filter((r) =>
                        r.eventName?.endsWith('.rate_limited')
                    )
                ).toEqual([]);
            });
        });
    });

    describe('requestTimeoutMs configuration', () => {
        it('defaults to 60000ms', () => {
            const requester = new TestRequester({});
            expect(requester.requestTimeoutMs).toBe(60_000);
        });

        it('honors an instance-level override', () => {
            const requester = new TestRequester({ requestTimeoutMs: 30_000 });
            expect(requester.requestTimeoutMs).toBe(30_000);
        });

        it('honors a class-level static override', () => {
            class TighterRequester extends Requester {
                static requestTimeoutMs = 15_000;
            }
            const requester = new TighterRequester({});
            expect(requester.requestTimeoutMs).toBe(15_000);
        });

        it('prefers instance param over class static', () => {
            class TighterRequester extends Requester {
                static requestTimeoutMs = 15_000;
            }
            const requester = new TighterRequester({ requestTimeoutMs: 5_000 });
            expect(requester.requestTimeoutMs).toBe(5_000);
        });

        it('accepts 0 to disable the timeout', () => {
            const requester = new TestRequester({ requestTimeoutMs: 0 });
            expect(requester.requestTimeoutMs).toBe(0);
        });

        it('accepts null to fall back to the class/default', () => {
            class TighterRequester extends Requester {
                static requestTimeoutMs = 15_000;
            }
            const requester = new TighterRequester({ requestTimeoutMs: null });
            expect(requester.requestTimeoutMs).toBe(15_000);
        });
    });

    describe('AbortController timeout behavior', () => {
        it('aborts and throws a FetchError when fetch never resolves', async () => {
            jest.useFakeTimers();
            try {
                const fetchMock = hangingFetch();
                const requester = new TestRequester({
                    requestTimeoutMs: 100,
                    fetch: fetchMock,
                });
                const p = requester._get({ url: 'https://example.com/slow' });
                p.catch(() => {}); // prevent unhandled-rejection noise
                await jest.advanceTimersByTimeAsync(101);
                await expect(p).rejects.toMatchObject({
                    isTimeout: true,
                    timeoutMs: 100,
                });
                expect(fetchMock).toHaveBeenCalledTimes(1);
            } finally {
                jest.useRealTimers();
            }
        });

        it('does not retry on timeout (single attempt only)', async () => {
            jest.useFakeTimers();
            try {
                const fetchMock = hangingFetch();
                const requester = new TestRequester({
                    requestTimeoutMs: 50,
                    backOff: [1, 1, 1],
                    fetch: fetchMock,
                });
                const p = requester._get({ url: 'https://example.com/hang' });
                p.catch(() => {});
                await jest.advanceTimersByTimeAsync(60);
                await expect(p).rejects.toMatchObject({ isTimeout: true });
                expect(fetchMock).toHaveBeenCalledTimes(1);
            } finally {
                jest.useRealTimers();
            }
        });

        it('fires the timeout when fetch hangs past requestTimeoutMs', async () => {
            jest.useFakeTimers();
            try {
                const requester = new TestRequester({
                    requestTimeoutMs: 200,
                    fetch: hangingFetch(),
                });
                const p = requester._get({
                    url: 'https://example.com/slow',
                });
                p.catch(() => {});
                // Advance just short of the timeout — still pending.
                await jest.advanceTimersByTimeAsync(150);
                // ...then past it — should now reject.
                await jest.advanceTimersByTimeAsync(100);
                await expect(p).rejects.toMatchObject({
                    isTimeout: true,
                    timeoutMs: 200,
                });
            } finally {
                jest.useRealTimers();
            }
        });

        it('does not wrap fetch in a timeout when requestTimeoutMs is 0', async () => {
            // When disabled, no AbortController is wired in — the fetch
            // options should not carry a `signal`.
            const fetchMock = jest.fn(async (_url, options) => {
                expect(options.signal).toBeUndefined();
                return {
                    status: 200,
                    headers: { get: () => 'application/json' },
                    json: async () => ({ ok: true }),
                };
            });
            const requester = new TestRequester({
                requestTimeoutMs: 0,
                fetch: fetchMock,
            });
            const result = await requester._get({
                url: 'https://example.com/ok',
            });
            expect(result).toEqual({ ok: true });
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        it('passes a signal to fetch when timeout is enabled', async () => {
            const fetchMock = jest.fn(async (_url, options) => {
                expect(options.signal).toBeDefined();
                expect(typeof options.signal.addEventListener).toBe('function');
                return {
                    status: 200,
                    headers: { get: () => 'application/json' },
                    json: async () => ({ ok: true }),
                };
            });
            const requester = new TestRequester({
                requestTimeoutMs: 30_000,
                fetch: fetchMock,
            });
            await requester._get({ url: 'https://example.com/ok' });
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        it('does not time out a fast, successful response', async () => {
            const fetchMock = okFetch({ data: 'fresh' });
            const requester = new TestRequester({
                requestTimeoutMs: 5_000,
                fetch: fetchMock,
            });
            const result = await requester._get({
                url: 'https://example.com/fast',
            });
            expect(result).toEqual({ data: 'fresh' });
        });

        it('aborts when the server sends headers but stalls the body', async () => {
            // node-fetch v2 resolves fetch() on headers received; body
            // reads happen later via parsedBody / response.text(). The
            // timer must stay active until the body is fully consumed.
            jest.useFakeTimers();
            try {
                let capturedSignal;
                const fetchMock = jest.fn(async (_url, options) => {
                    capturedSignal = options.signal;
                    return {
                        status: 200,
                        headers: { get: () => 'application/json' },
                        json: () =>
                            new Promise((_resolve, reject) => {
                                capturedSignal.addEventListener(
                                    'abort',
                                    () => {
                                        const err = new Error(
                                            'aborted mid-body'
                                        );
                                        err.name = 'AbortError';
                                        reject(err);
                                    }
                                );
                            }),
                    };
                });
                const requester = new TestRequester({
                    requestTimeoutMs: 100,
                    fetch: fetchMock,
                });
                const p = requester._get({
                    url: 'https://example.com/stalled-body',
                });
                p.catch(() => {});
                await jest.advanceTimersByTimeAsync(150);
                await expect(p).rejects.toMatchObject({
                    isTimeout: true,
                    timeoutMs: 100,
                });
            } finally {
                jest.useRealTimers();
            }
        });

        it('clears the timer once the fetch resolves so long-running processes do not leak timers', async () => {
            const fetchMock = okFetch();
            const requester = new TestRequester({
                requestTimeoutMs: 5_000,
                fetch: fetchMock,
            });
            // If we did not clear the timer, the Node event loop would keep
            // a reference and this assertion is a smoke test for that: the
            // call should resolve in real time, not after 5s.
            const start = Date.now();
            await requester._get({ url: 'https://example.com/ok' });
            expect(Date.now() - start).toBeLessThan(500);
        });
    });

    describe('401 auth-state contract', () => {
        function oauthFetch(responses) {
            const queue = [...responses];
            return jest.fn(async () => {
                const next = queue.shift();
                if (!next) throw new Error('unexpected fetch call');
                return {
                    status: next.status,
                    headers: new Map([['Content-Type', 'application/json']]),
                    json: async () => next.body ?? {},
                    text: async () => JSON.stringify(next.body ?? {}),
                };
            });
        }

        class RefreshableRequester extends Requester {
            constructor(params) {
                super(params);
                this.isRefreshable = true;
            }
            async addAuthHeaders(headers) {
                return headers;
            }
            async refreshAuth() {
                return true;
            }
        }

        it('grants 3 grace retries on a 401 before firing INVALID_AUTH when the requester is not refreshable', async () => {
            const fetchMock = oauthFetch([
                { status: 401, body: { error: 'unauthorized' } },
                { status: 401, body: { error: 'unauthorized' } },
                { status: 401, body: { error: 'unauthorized' } },
                { status: 401, body: { error: 'unauthorized' } },
            ]);
            const requester = new TestRequester({
                fetch: fetchMock,
                backOff: [0, 0, 0],
            });
            requester.notify = jest.fn();

            await expect(
                requester._get({ url: 'https://example.com/protected' })
            ).rejects.toThrow();

            expect(requester.notify).toHaveBeenCalledWith(
                requester.DLGT_INVALID_AUTH,
                expect.objectContaining({ statusCode: 401 })
            );
            expect(fetchMock).toHaveBeenCalledTimes(4);
        });

        it('caps grace retries at the backOff array length even when MAX_AUTH_RETRIES allows more', async () => {
            const fetchMock = oauthFetch([
                { status: 401, body: { error: 'unauthorized' } },
                { status: 401, body: { error: 'unauthorized' } },
            ]);
            const requester = new TestRequester({
                fetch: fetchMock,
                backOff: [0],
            });
            requester.notify = jest.fn();

            await expect(
                requester._get({ url: 'https://example.com/protected' })
            ).rejects.toThrow();

            expect(requester.notify).toHaveBeenCalledWith(
                requester.DLGT_INVALID_AUTH,
                expect.objectContaining({ statusCode: 401 })
            );
            expect(fetchMock).toHaveBeenCalledTimes(2);
        });

        it('does NOT fire INVALID_AUTH when a later grace retry succeeds', async () => {
            const fetchMock = oauthFetch([
                { status: 401, body: { error: 'unauthorized' } },
                { status: 401, body: { error: 'unauthorized' } },
                { status: 200, body: { ok: true } },
            ]);
            const requester = new TestRequester({
                fetch: fetchMock,
                backOff: [0, 0, 0],
            });
            requester.notify = jest.fn();

            const result = await requester._get({
                url: 'https://example.com/protected',
            });

            expect(result).toEqual({ ok: true });
            expect(requester.notify).not.toHaveBeenCalled();
            expect(fetchMock).toHaveBeenCalledTimes(3);
        });

        it('waits an escalating backOff delay for each successive grace retry', async () => {
            const fetchMock = oauthFetch([
                { status: 401, body: { error: 'unauthorized' } },
                { status: 401, body: { error: 'unauthorized' } },
                { status: 401, body: { error: 'unauthorized' } },
                { status: 200, body: { ok: true } },
            ]);
            const requester = new TestRequester({
                fetch: fetchMock,
                backOff: [10, 20, 30],
                requestTimeoutMs: 0,
            });
            requester.notify = jest.fn();
            const sleptDelays = [];
            const originalSetTimeout = global.setTimeout;
            jest.spyOn(global, 'setTimeout').mockImplementation((fn, delay) => {
                sleptDelays.push(delay);
                return originalSetTimeout(fn, 0);
            });

            try {
                await requester._get({
                    url: 'https://example.com/protected',
                });
            } finally {
                global.setTimeout.mockRestore();
            }

            expect(sleptDelays).toEqual([10_000, 20_000, 30_000]);
        });

        it('still grants the 401 grace retries after an earlier 429 already consumed a backoff attempt', async () => {
            const fetchMock = oauthFetch([
                { status: 429 },
                { status: 401, body: { error: 'unauthorized' } },
                { status: 401, body: { error: 'unauthorized' } },
                { status: 200, body: { ok: true } },
            ]);
            const requester = new TestRequester({
                fetch: fetchMock,
                backOff: [0, 0, 0, 0],
            });
            requester.notify = jest.fn();

            const result = await requester._get({
                url: 'https://example.com/protected',
            });

            expect(result).toEqual({ ok: true });
            expect(requester.notify).not.toHaveBeenCalled();
            expect(fetchMock).toHaveBeenCalledTimes(4);
        });

        it('does NOT fire INVALID_AUTH when refresh succeeds and retry returns 200', async () => {
            const fetchMock = oauthFetch([
                { status: 401 },
                { status: 200, body: { ok: true } },
            ]);
            const requester = new RefreshableRequester({ fetch: fetchMock });
            requester.refreshAuth = jest.fn().mockResolvedValue(true);
            requester.notify = jest.fn();

            const result = await requester._get({ url: 'https://example.com/protected' });

            expect(result).toEqual({ ok: true });
            expect(requester.refreshAuth).toHaveBeenCalledTimes(1);
            expect(requester.notify).not.toHaveBeenCalledWith(requester.DLGT_INVALID_AUTH);
            expect(fetchMock).toHaveBeenCalledTimes(2);
        });

        it('fires INVALID_AUTH with diagnostic detail and throws when refresh fails', async () => {
            const fetchMock = oauthFetch([
                { status: 401, body: { error: 'unauthorized' } },
            ]);
            const requester = new RefreshableRequester({ fetch: fetchMock });
            requester.refreshAuth = jest.fn().mockResolvedValue(false);
            requester.notify = jest.fn();

            await expect(
                requester._get({ url: 'https://example.com/protected' })
            ).rejects.toThrow();

            expect(requester.refreshAuth).toHaveBeenCalledTimes(1);
            expect(requester.notify).toHaveBeenCalledWith(
                requester.DLGT_INVALID_AUTH,
                expect.objectContaining({ statusCode: 401 })
            );
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        it('keeps refreshing and retrying across up to 3 consecutive 401s, then succeeds', async () => {
            const fetchMock = oauthFetch([
                { status: 401 },
                { status: 401 },
                { status: 401 },
                { status: 200, body: { ok: true } },
            ]);
            const requester = new RefreshableRequester({ fetch: fetchMock });
            requester.refreshAuth = jest.fn().mockResolvedValue(true);
            requester.notify = jest.fn();

            const result = await requester._get({
                url: 'https://example.com/protected',
            });

            expect(result).toEqual({ ok: true });
            expect(requester.refreshAuth).toHaveBeenCalledTimes(3);
            expect(requester.notify).not.toHaveBeenCalled();
            expect(fetchMock).toHaveBeenCalledTimes(4);
        });

        it('fires INVALID_AUTH once the refresh budget is exhausted even though every refresh succeeded', async () => {
            const fetchMock = oauthFetch([
                { status: 401 },
                { status: 401 },
                { status: 401 },
                { status: 401 },
            ]);
            const requester = new RefreshableRequester({ fetch: fetchMock });
            requester.refreshAuth = jest.fn().mockResolvedValue(true);
            requester.notify = jest.fn();

            await expect(
                requester._get({ url: 'https://example.com/protected' })
            ).rejects.toThrow();

            expect(requester.refreshAuth).toHaveBeenCalledTimes(3);
            expect(requester.notify).toHaveBeenCalledWith(
                requester.DLGT_INVALID_AUTH,
                expect.objectContaining({ statusCode: 401 })
            );
            expect(fetchMock).toHaveBeenCalledTimes(4);
        });

        it('resets refreshCount after a successful 2xx so a later 401 can attempt refresh again', async () => {
            const fetchMock = oauthFetch([
                { status: 401 },
                { status: 200, body: { ok: 'first' } },
                { status: 401 },
                { status: 200, body: { ok: 'second' } },
            ]);
            const requester = new RefreshableRequester({ fetch: fetchMock });
            requester.refreshAuth = jest.fn().mockResolvedValue(true);
            requester.notify = jest.fn();

            const r1 = await requester._get({ url: 'https://example.com/first' });
            const r2 = await requester._get({ url: 'https://example.com/second' });

            expect(r1).toEqual({ ok: 'first' });
            expect(r2).toEqual({ ok: 'second' });
            expect(requester.refreshAuth).toHaveBeenCalledTimes(2);
            expect(requester.notify).not.toHaveBeenCalledWith(requester.DLGT_INVALID_AUTH);
            expect(fetchMock).toHaveBeenCalledTimes(4);
        });
    });

    describe('ECONNRESET retry (regression guard)', () => {
        it('still retries on ECONNRESET following the backOff schedule', async () => {
            jest.useFakeTimers();
            try {
                let attempts = 0;
                const fetchMock = jest.fn(async () => {
                    attempts++;
                    if (attempts <= 2) {
                        const err = new Error('socket hang up');
                        err.code = 'ECONNRESET';
                        throw err;
                    }
                    return {
                        status: 200,
                        headers: { get: () => 'application/json' },
                        json: async () => ({ ok: true }),
                    };
                });
                const requester = new TestRequester({
                    fetch: fetchMock,
                    backOff: [0, 0, 0],
                    requestTimeoutMs: 10_000,
                });

                const p = requester._get({ url: 'https://example.com/flaky' });
                // Backoffs are 0s, so just flush queued timeouts/microtasks.
                await jest.runAllTimersAsync();
                const result = await p;
                expect(result).toEqual({ ok: true });
                expect(fetchMock).toHaveBeenCalledTimes(3);
            } finally {
                jest.useRealTimers();
            }
        });
    });
});
