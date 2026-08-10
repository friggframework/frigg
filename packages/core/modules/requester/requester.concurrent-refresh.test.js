const { Requester } = require('./requester');
const { OAuth2Requester } = require('./oauth-2');

/**
 * Models the upstream's auth state. Mirrors QuickBooks/Intuit semantics: a
 * successful refresh rotates BOTH tokens and force-expires the previous
 * refresh token, so a second caller presenting the pre-rotation refresh
 * token gets `invalid_grant`.
 */
function makeUpstream() {
    return {
        validAccessToken: 'access-0',
        validRefreshToken: 'refresh-0',
        rotations: 0,
        /** Access token lapses on its own (the overnight case) — refresh token stays good. */
        expireAccessToken() {
            this.validAccessToken = 'access-lapsed';
        },
        rotate() {
            this.rotations++;
            this.validAccessToken = `access-${this.rotations}`;
            this.validRefreshToken = `refresh-${this.rotations}`;
            return {
                access: this.validAccessToken,
                refresh: this.validRefreshToken,
            };
        },
    };
}

/**
 * Requester double that records how many refreshes ran and how many ran
 * concurrently. `releaseRefresh` holds every in-flight refresh open at once so
 * the concurrency window is deterministic rather than timing-dependent.
 */
class ConcurrentRefreshRequester extends Requester {
    constructor(params) {
        super(params);
        this.isRefreshable = true;
        this.upstream = params.upstream;
        this.releaseRefresh = params.releaseRefresh ?? Promise.resolve();
        // Lets a test substitute the refresh outcome (hard failure, or a
        // "success" that does not actually mint a usable token).
        this.refreshImpl = params.refreshImpl ?? null;
        this.accessToken = params.upstream.validAccessToken;
        this.refreshToken = params.upstream.validRefreshToken;
        this.refreshCalls = 0;
        this.inFlightRefreshes = 0;
        this.peakInFlightRefreshes = 0;
        this.invalidGrants = 0;
    }

    async addAuthHeaders(headers = {}) {
        return { ...headers, Authorization: `Bearer ${this.accessToken}` };
    }

    async refreshAuth() {
        this.refreshCalls++;
        this.inFlightRefreshes++;
        this.peakInFlightRefreshes = Math.max(
            this.peakInFlightRefreshes,
            this.inFlightRefreshes
        );
        // Captured before awaiting, exactly as the real module does: the
        // in-memory refresh token is read at call time.
        const presentedRefreshToken = this.refreshToken;
        try {
            await this.releaseRefresh;
            if (this.refreshImpl) {
                return this.refreshImpl();
            }
            if (presentedRefreshToken !== this.upstream.validRefreshToken) {
                this.invalidGrants++;
                return false;
            }
            const rotated = this.upstream.rotate();
            this.accessToken = rotated.access;
            this.refreshToken = rotated.refresh;
            return true;
        } finally {
            this.inFlightRefreshes--;
        }
    }
}

function makeFetch(upstream) {
    return jest.fn(async (_url, options) => {
        const presented = String(options?.headers?.Authorization || '').replace(
            'Bearer ',
            ''
        );
        const unauthorized = presented !== upstream.validAccessToken;
        return {
            status: unauthorized ? 401 : 200,
            // Map with the exact casing parsedBody looks up, so the JSON path is really
            // exercised; it also satisfies FetchError.create's entry iteration.
            headers: new Map([['Content-Type', 'application/json']]),
            json: async () => (unauthorized ? { error: 'invalid_token' } : { ok: true }),
            text: async () =>
                unauthorized ? '{"error":"invalid_token"}' : '{"ok":true}',
        };
    });
}

function deferred() {
    let resolve;
    const promise = new Promise((r) => {
        resolve = r;
    });
    return { promise, resolve };
}

describe('Requester concurrent 401 refresh', () => {
    /**
     * The production shape: a sync stage processes records in chunks of 5
     * concurrently through ONE api-module instance. Overnight the access token
     * has lapsed, so all 5 requests 401 at nearly the same moment.
     */
    async function runConcurrentBurst(concurrency = 5) {
        const upstream = makeUpstream();
        const gate = deferred();
        const requester = new ConcurrentRefreshRequester({
            upstream,
            releaseRefresh: gate.promise,
            fetch: makeFetch(upstream),
            requestTimeoutMs: 0,
            backOff: [0, 0, 0],
        });
        jest.spyOn(requester, 'notify').mockResolvedValue(undefined);

        upstream.expireAccessToken();

        const inFlight = Array.from({ length: concurrency }, (_, i) =>
            requester._get({ url: `https://api.example.com/record/${i}` })
        );
        // Let every request reach its 401 handling before any refresh completes.
        await new Promise((r) => setImmediate(r));
        gate.resolve();

        const results = await Promise.allSettled(inFlight);
        return { requester, results, upstream };
    }

    it('refreshes only once for a burst of concurrent 401s', async () => {
        const { requester } = await runConcurrentBurst(5);

        expect(requester.refreshCalls).toBe(1);
        expect(requester.peakInFlightRefreshes).toBe(1);
    });

    it('never self-inflicts invalid_grant by rotating the token twice', async () => {
        const { requester, upstream } = await runConcurrentBurst(5);

        expect(requester.invalidGrants).toBe(0);
        expect(upstream.rotations).toBe(1);
    });

    it('completes every concurrent request once the refresh succeeds', async () => {
        const { results } = await runConcurrentBurst(5);

        const rejected = results.filter((r) => r.status === 'rejected');
        expect(rejected).toHaveLength(0);
    });

    it('does not flag the credential invalid when the refresh succeeds', async () => {
        const { requester } = await runConcurrentBurst(5);

        const invalidAuthNotifications = requester.notify.mock.calls.filter(
            ([delegateString]) => delegateString === requester.DLGT_INVALID_AUTH
        );
        expect(invalidAuthNotifications).toHaveLength(0);
    });

    // --- Safety properties the retry budget existed to provide. The
    // single-flight change must not weaken any of these.

    it('releases the slot so a genuinely later 401 can refresh again', async () => {
        const upstream = makeUpstream();
        const requester = new ConcurrentRefreshRequester({
            upstream,
            fetch: makeFetch(upstream),
            requestTimeoutMs: 0,
            backOff: [0, 0, 0],
        });
        jest.spyOn(requester, 'notify').mockResolvedValue(undefined);

        upstream.expireAccessToken();
        await requester._get({ url: 'https://api.example.com/first' });

        // Token lapses again later in the same instance's lifetime.
        upstream.expireAccessToken();
        await requester._get({ url: 'https://api.example.com/second' });

        expect(requester.refreshCalls).toBe(2);
        expect(requester.peakInFlightRefreshes).toBe(1);
    });

    it('still bounds retries when a refresh reports success but mints no usable token', async () => {
        const upstream = makeUpstream();
        const requester = new ConcurrentRefreshRequester({
            upstream,
            fetch: makeFetch(upstream),
            requestTimeoutMs: 0,
            backOff: [0, 0, 0],
            // Pathological upstream: refresh claims success, requests keep 401ing.
            refreshImpl: () => true,
        });
        jest.spyOn(requester, 'notify').mockResolvedValue(undefined);

        upstream.expireAccessToken();

        await expect(
            requester._get({ url: 'https://api.example.com/never-authorized' })
        ).rejects.toThrow();
        // Terminates on the budget rather than looping forever.
        expect(requester.refreshCalls).toBe(3);
    });

    it('rejects every waiter when the shared refresh fails', async () => {
        const upstream = makeUpstream();
        const gate = deferred();
        const requester = new ConcurrentRefreshRequester({
            upstream,
            releaseRefresh: gate.promise,
            fetch: makeFetch(upstream),
            requestTimeoutMs: 0,
            backOff: [0, 0, 0],
            refreshImpl: () => false,
        });
        jest.spyOn(requester, 'notify').mockResolvedValue(undefined);

        upstream.expireAccessToken();

        const inFlight = Array.from({ length: 5 }, (_, i) =>
            requester._get({ url: `https://api.example.com/record/${i}` })
        );
        await new Promise((r) => setImmediate(r));
        gate.resolve();
        const results = await Promise.allSettled(inFlight);

        expect(results.every((r) => r.status === 'rejected')).toBe(true);
        // One shared attempt, not one per request.
        expect(requester.refreshCalls).toBe(1);
    });
});

/**
 * Re-entrancy. OAuth2Requester performs its token request through `this._post`,
 * which re-enters _rawRequest. If the token endpoint itself answers 401 (an
 * invalid_client — revoked or rotated client secret) the nested 401 must be
 * fatal. Joining the in-flight refresh there would await the very promise whose
 * resolution depends on the nested call returning: a circular await that hangs
 * until the Lambda times out, leaves the credential un-flagged, and poisons the
 * slot for every later request on the instance.
 */
describe('Requester refresh re-entrancy', () => {
    function settlesWithin(promise, ms) {
        let timer;
        const timeout = new Promise((_, reject) => {
            timer = setTimeout(
                () => reject(new Error(`did not settle within ${ms}ms — hung`)),
                ms
            );
        });
        return Promise.race([
            promise.then(
                (v) => ({ status: 'fulfilled', value: v }),
                (e) => ({ status: 'rejected', reason: e })
            ),
            timeout,
        ]).finally(() => clearTimeout(timer));
    }

    function unauthorizedEverything() {
        return jest.fn(async () => ({
            status: 401,
            headers: new Map([['Content-Type', 'application/json']]),
            json: async () => ({ error: 'invalid_client' }),
            text: async () => '{"error":"invalid_client"}',
        }));
    }

    function makeTokenEndpointRejecter() {
        const requester = new OAuth2Requester({
            grant_type: 'client_credentials',
            client_id: 'id',
            client_secret: 'secret',
            access_token: 'stale',
            fetch: unauthorizedEverything(),
            requestTimeoutMs: 0,
            backOff: [0, 0, 0],
        });
        requester.tokenUri = 'https://auth.example.com/token';
        jest.spyOn(requester, 'notify').mockResolvedValue(undefined);
        return requester;
    }

    it('fails fast instead of deadlocking when the token endpoint answers 401', async () => {
        const requester = makeTokenEndpointRejecter();

        const outcome = await settlesWithin(
            requester._get({ url: 'https://api.example.com/thing' }),
            1500
        );

        expect(outcome.status).toBe('rejected');
    });

    // A request dispatched before a refresh can have its 401 land after that
    // refresh finished. The current token was never tried, so refreshing again
    // is waste — and every extra rotation invalidates the pair a concurrent
    // holder (the other Lambda) just minted.
    it('does not rotate again for a 401 that was already stale when it landed', async () => {
        const upstream = makeUpstream();
        const stragglerResponse = deferred();
        let callIndex = 0;

        const requester = new ConcurrentRefreshRequester({
            upstream,
            requestTimeoutMs: 0,
            backOff: [0, 0, 0],
            fetch: jest.fn(async (_url, options) => {
                const mine = ++callIndex;
                const presented = String(
                    options?.headers?.Authorization || ''
                ).replace('Bearer ', '');
                // Call 1 is the straggler: hold its response until the other
                // request has completed its refresh.
                if (mine === 1) await stragglerResponse.promise;
                const unauthorized = presented !== upstream.validAccessToken;
                return {
                    status: unauthorized ? 401 : 200,
                    headers: new Map([['Content-Type', 'application/json']]),
                    json: async () => ({ ok: !unauthorized }),
                    text: async () => '{}',
                };
            }),
        });
        jest.spyOn(requester, 'notify').mockResolvedValue(undefined);

        upstream.expireAccessToken();

        const straggler = requester._get({ url: 'https://api.example.com/slow' });
        await new Promise((r) => setImmediate(r));

        // Second request 401s promptly and performs the one legitimate refresh.
        await requester._get({ url: 'https://api.example.com/fast' });
        expect(upstream.rotations).toBe(1);

        stragglerResponse.resolve();
        await expect(straggler).resolves.toBeDefined();

        expect(upstream.rotations).toBe(1);
        expect(requester.refreshCalls).toBe(1);
    });

    it('clears the refresh slot after a token-endpoint 401', async () => {
        const requester = makeTokenEndpointRejecter();

        await settlesWithin(
            requester._get({ url: 'https://api.example.com/thing' }),
            1500
        ).catch(() => {});

        // A poisoned slot would make every later request await a dead promise.
        expect(requester._inFlightRefresh).toBeNull();
    });
});
