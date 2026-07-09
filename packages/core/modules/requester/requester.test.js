const { Requester } = require('./requester');

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
    describe('429 and 5xx testing', () => {
        let backOffArray = [1, 1, 1];
        let requester = new TestRequester({ backOff: backOffArray });
        let sum = backOffArray.reduce((a, b) => {
            return a + b;
        }, 0);
        it.skip("should retry with 'exponential' back off due to 429", async () => {
            let startTime = await Date.now();
            let res = await requester._get({
                url: 'https://70e18ff0-1967-4fb5-8f96-10477ab6bb9e.mock.pstmn.io//429',
            });
            let endTime = await Date.now();
            let difference = endTime - startTime;
            expect(difference).toBeGreaterThan(sum * 1000);
        });

        it.skip("should retry with 'exponential' back off due to 500", async () => {
            let startTime = await Date.now();
            let res = await requester._get({
                url: 'https://70e18ff0-1967-4fb5-8f96-10477ab6bb9e.mock.pstmn.io//5xx',
            });
            let endTime = await Date.now();
            let difference = endTime - startTime;
            expect(difference).toBeGreaterThan(sum * 1000);
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
