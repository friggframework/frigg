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

    describe('401 handling — do not speculatively mark ERROR', () => {
        function jsonOk(body = { ok: true }) {
            return {
                status: 200,
                headers: { get: () => 'application/json' },
                json: async () => body,
            };
        }
        function unauthorized() {
            return {
                status: 401,
                headers: { get: () => 'application/json' },
                json: async () => ({ error: 'unauthorized' }),
                text: async () => '{"error":"unauthorized"}',
            };
        }

        it('fires DLGT_INVALID_AUTH when the token is NOT refreshable (case 1)', async () => {
            const fetchMock = jest.fn().mockResolvedValueOnce(unauthorized());
            const requester = new TestRequester({
                fetch: fetchMock,
                backOff: [],
            });
            requester.isRefreshable = false;
            const notify = jest.fn();
            requester.notify = notify;

            await expect(requester._get({ url: 'https://x.example/r' })).rejects.toBeDefined();
            expect(notify).toHaveBeenCalledWith('INVALID_AUTH');
        });

        it('attempts refresh when the token IS refreshable and retries the request on success (case 3)', async () => {
            const fetchMock = jest
                .fn()
                .mockResolvedValueOnce(unauthorized())
                .mockResolvedValueOnce(jsonOk({ ok: true }));
            const requester = new TestRequester({
                fetch: fetchMock,
                backOff: [],
            });
            requester.isRefreshable = true;
            requester.refreshAuth = jest.fn().mockResolvedValue(true);
            const notify = jest.fn();
            requester.notify = notify;

            const result = await requester._get({ url: 'https://x.example/r' });
            expect(result).toEqual({ ok: true });
            expect(requester.refreshAuth).toHaveBeenCalledTimes(1);
            // Refresh succeeded → do not fire INVALID_AUTH (no ERROR transition).
            expect(notify).not.toHaveBeenCalled();
        });

        it('does NOT fire INVALID_AUTH itself when refresh fails — refreshAuth handles that (case 2)', async () => {
            // refreshAuth() returns false on failure and fires INVALID_AUTH from
            // its own catch in oauth-2.js. The requester must not double-fire.
            const fetchMock = jest.fn().mockResolvedValueOnce(unauthorized());
            const requester = new TestRequester({
                fetch: fetchMock,
                backOff: [],
            });
            requester.isRefreshable = true;
            requester.refreshAuth = jest.fn().mockResolvedValue(false);
            const notify = jest.fn();
            requester.notify = notify;

            await expect(requester._get({ url: 'https://x.example/r' })).rejects.toBeDefined();
            expect(requester.refreshAuth).toHaveBeenCalledTimes(1);
            // Requester does not fire INVALID_AUTH on refresh failure — oauth-2's
            // refreshAuth catch is the sole source for that signal.
            expect(notify).not.toHaveBeenCalled();
        });

        it('does NOT speculatively fire INVALID_AUTH on a second 401 within the same requester instance', async () => {
            // First request: 401 → refresh succeeds → retry succeeds. Second
            // request on the SAME requester: 401 again (transient). Old
            // behavior fired INVALID_AUTH because refreshCount > 0. New
            // behavior throws the 401 up without marking ERROR — a
            // subsequently-constructed requester (next worker invocation)
            // will get a chance to refresh fresh.
            const fetchMock = jest
                .fn()
                .mockResolvedValueOnce(unauthorized()) // first call: 401
                .mockResolvedValueOnce(jsonOk({ ok: true })) // refresh retry: ok
                .mockResolvedValueOnce(unauthorized()); // second call: 401 again
            const requester = new TestRequester({
                fetch: fetchMock,
                backOff: [],
            });
            requester.isRefreshable = true;
            requester.refreshAuth = jest.fn().mockResolvedValue(true);
            const notify = jest.fn();
            requester.notify = notify;

            await requester._get({ url: 'https://x.example/a' });
            await expect(requester._get({ url: 'https://x.example/b' })).rejects.toBeDefined();

            // Refresh was attempted once (refreshCount guard prevents loops).
            expect(requester.refreshAuth).toHaveBeenCalledTimes(1);
            // No INVALID_AUTH on the second 401 — let the 401 propagate.
            expect(notify).not.toHaveBeenCalled();
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
