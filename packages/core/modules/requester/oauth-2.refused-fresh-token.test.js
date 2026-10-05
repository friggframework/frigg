const { OAuth2Requester } = require('./oauth-2');
const { createMemorySink } = require('../../logs');

const TOKEN_URI = 'https://auth.example.com/token';
const API = 'https://api.example.com';

/**
 * A provider with single-use rotating refresh tokens. Each refresh mints a
 * new token pair and kills the refresh token that it consumed. The token
 * request goes through the requester's own fetch, as it does in
 * OAuth2Requester.refreshAccessToken. The other suites mock the refresh, so
 * they cannot see a token-endpoint response that changes the requester state.
 *
 * `refusedPaths` answer 401 to every access token, also to a token that the
 * provider minted a moment ago. Some providers answer 401, not 403, when the
 * grant does not have the scope that an endpoint needs.
 *
 * `mintLimit` keeps a regression finite. The refresh path has no timer, so an
 * unbounded refresh loop runs on microtasks only, and the jest test timeout
 * cannot fire. After the limit, the token endpoint answers 400, which is a
 * definitive rejection, and the request fails in milliseconds.
 */
function makeProvider({ refusedPaths = [], mintLimit = 20 } = {}) {
    const provider = {
        accessToken: 'access-0',
        refreshToken: 'refresh-0',
        rotations: 0,
        tokenCalls: 0,
        resourceCalls: {},
    };
    const respond = (status, body) => ({
        status,
        headers: new Map([['Content-Type', 'application/json']]),
        json: async () => body,
        text: async () => JSON.stringify(body),
    });

    provider.fetch = jest.fn(async (url, options) => {
        if (url === TOKEN_URI) {
            provider.tokenCalls++;
            const presented = options.body.get('refresh_token');
            if (
                presented !== provider.refreshToken ||
                provider.rotations >= mintLimit
            ) {
                return respond(400, { error: 'invalid_grant' });
            }
            provider.rotations++;
            provider.accessToken = `access-${provider.rotations}`;
            provider.refreshToken = `refresh-${provider.rotations}`;
            return respond(200, {
                access_token: provider.accessToken,
                refresh_token: provider.refreshToken,
                expires_in: 3600,
            });
        }

        const { pathname } = new URL(url);
        provider.resourceCalls[pathname] =
            (provider.resourceCalls[pathname] ?? 0) + 1;
        const presented = String(options.headers.Authorization ?? '').replace(
            'Bearer ',
            ''
        );
        if (refusedPaths.includes(pathname)) {
            return respond(401, { error: 'insufficient_scope' });
        }
        if (presented !== provider.accessToken) {
            return respond(401, { error: 'invalid_token' });
        }
        return respond(200, { ok: pathname });
    });

    /** The access token lapses. The refresh token stays good. */
    provider.expireAccessToken = () => {
        provider.accessToken = `lapsed-${provider.rotations}`;
    };

    return provider;
}

function deferred() {
    let resolve;
    const promise = new Promise((r) => {
        resolve = r;
    });
    return { promise, resolve };
}

/** Records the outcome at once, so an early rejection is never unhandled. */
function settled(promise) {
    return promise.then(
        (value) => ({ status: 'fulfilled', value }),
        (reason) => ({ status: 'rejected', reason })
    );
}

/** Lets queued promise callbacks run until `condition` is true. */
async function until(condition) {
    for (let turn = 0; turn < 100; turn++) {
        if (condition()) return;
        await new Promise((resolve) => setImmediate(resolve));
    }
    throw new Error('The condition did not become true in 100 turns');
}

/** Fails the nth call to `path` one time with a transient error. */
function failOnce(provider, path, nth, failure) {
    let calls = 0;
    return jest.fn(async (url, options) => {
        if (new URL(url).pathname === path && ++calls === nth) {
            if (failure === 'ECONNRESET') {
                throw Object.assign(new Error('socket hang up'), {
                    code: 'ECONNRESET',
                });
            }
            return {
                status: failure,
                headers: new Map([['Content-Type', 'application/json']]),
                json: async () => ({ error: 'transient' }),
                text: async () => '{"error":"transient"}',
            };
        }
        return provider.fetch(url, options);
    });
}

/** Holds the nth call to `path` until the test releases it. */
function holdCall(provider, path, nth) {
    const held = deferred();
    const release = deferred();
    let calls = 0;
    const fetch = jest.fn(async (url, options) => {
        if (new URL(url).pathname === path && ++calls === nth) {
            held.resolve();
            await release.promise;
        }
        return provider.fetch(url, options);
    });
    return { fetch, held: held.promise, release: release.resolve };
}

/** Stands in for the Module: it persists and reloads one credential row. */
function makeCredentialStore(provider) {
    return {
        stored: {
            access_token: provider.accessToken,
            refresh_token: provider.refreshToken,
        },
        invalidAuthCalls: 0,
        async receiveNotification(notifier, delegateString) {
            if (delegateString === 'TOKEN_UPDATE') {
                this.stored = {
                    access_token: notifier.access_token,
                    refresh_token: notifier.refresh_token,
                };
            }
            if (delegateString === 'CREDENTIAL_RELOAD') {
                return { ...this.stored };
            }
            if (delegateString === 'INVALID_AUTH') {
                this.invalidAuthCalls++;
            }
        },
    };
}

function makeRequester(
    provider,
    store,
    { fetch = provider.fetch, telemetry } = {}
) {
    return new OAuth2Requester({
        delegate: store,
        grant_type: 'authorization_code',
        client_id: 'id',
        client_secret: 'secret',
        tokenUri: TOKEN_URI,
        access_token: store.stored.access_token,
        refresh_token: store.stored.refresh_token,
        fetch,
        telemetry,
        requestTimeoutMs: 0,
        backOff: [0, 0, 0],
        credentialReloadBackoffMs: [0],
    });
}

const get = (requester, path) => requester._get({ url: `${API}${path}` });

describe('OAuth2Requester when the provider refuses a freshly minted token', () => {
    it('spends one refresh and surfaces the 401 without invalidating the credential', async () => {
        const provider = makeProvider({ refusedPaths: ['/scoped'] });
        const store = makeCredentialStore(provider);
        const requester = makeRequester(provider, store);

        await expect(get(requester, '/scoped')).rejects.toMatchObject({
            statusCode: 401,
        });

        expect(provider.tokenCalls).toBe(1);
        expect(provider.resourceCalls['/scoped']).toBe(2);
        expect(store.invalidAuthCalls).toBe(0);
        expect(store.stored.refresh_token).toBe(provider.refreshToken);
    });

    it('stops refreshing after the budget while the provider mints tokens and refuses each one', async () => {
        const provider = makeProvider({ refusedPaths: ['/scoped'] });
        const store = makeCredentialStore(provider);
        const requester = makeRequester(provider, store);
        const tokenCallsPerCall = [];

        for (let call = 0; call < 4; call++) {
            const before = provider.tokenCalls;
            await expect(get(requester, '/scoped')).rejects.toMatchObject({
                statusCode: 401,
            });
            tokenCallsPerCall.push(provider.tokenCalls - before);
        }

        // The 200 of the token endpoint does not refill the budget.
        expect(tokenCallsPerCall).toEqual([1, 1, 1, 0]);
        expect(store.invalidAuthCalls).toBe(0);
    });

    it('does not rotate again for a straggler that the new token of a sibling cannot help', async () => {
        const provider = makeProvider({ refusedPaths: ['/scoped'] });
        const store = makeCredentialStore(provider);
        const { fetch, held, release } = holdCall(provider, '/scoped', 1);
        const requester = makeRequester(provider, store, { fetch });
        provider.expireAccessToken();

        // The straggler's first 401 arrives after the sibling refreshed.
        const straggler = get(requester, '/scoped');
        await held;
        await expect(get(requester, '/ok')).resolves.toEqual({ ok: '/ok' });
        release();

        await expect(straggler).rejects.toMatchObject({ statusCode: 401 });
        expect(provider.rotations).toBe(1);
        expect(store.invalidAuthCalls).toBe(0);
    });

    it('shares one refresh across a burst of calls that the new token cannot help', async () => {
        const provider = makeProvider({ refusedPaths: ['/scoped'] });
        const store = makeCredentialStore(provider);
        const { fetch, held, release } = holdCall(provider, '/token', 1);
        const requester = makeRequester(provider, store, { fetch });

        const burst = Array.from({ length: 5 }, () =>
            get(requester, '/scoped')
        );
        await held;
        release();
        const results = await Promise.allSettled(burst);

        expect(results.map((r) => r.reason?.statusCode)).toEqual([
            401, 401, 401, 401, 401,
        ]);
        expect(provider.tokenCalls).toBe(1);
        expect(store.invalidAuthCalls).toBe(0);
    });

    it('refreshes once for each refused call when the calls between them succeed', async () => {
        const provider = makeProvider({ refusedPaths: ['/scoped'] });
        const store = makeCredentialStore(provider);
        const requester = makeRequester(provider, store);

        for (let webhook = 0; webhook < 4; webhook++) {
            await get(requester, '/ok');
            const before = provider.tokenCalls;
            await get(requester, '/scoped').catch(() => {});
            // The remaining cost: one rotation for each refused call.
            expect(provider.tokenCalls - before).toBe(1);
        }

        expect(store.invalidAuthCalls).toBe(0);
    });

    it('reports each call that a spent budget stops, without INVALID_AUTH', async () => {
        const sink = createMemorySink();
        const telemetry = { count: jest.fn() };
        const provider = makeProvider({ refusedPaths: ['/scoped'] });
        const store = makeCredentialStore(provider);
        const requester = makeRequester(provider, store, { telemetry });

        for (let call = 0; call < 5; call++) {
            await get(requester, '/scoped').catch(() => {});
        }

        const counted = telemetry.count.mock.calls.filter(
            ([name]) => name === 'frigg.auth.refresh_budget_spent'
        );
        expect(counted).toHaveLength(2);
        const warnings = sink.records.filter((r) =>
            r.eventName?.endsWith('.refresh_budget_spent')
        );
        expect(warnings).toHaveLength(2);
        expect(store.invalidAuthCalls).toBe(0);
    });

    describe('after a transient failure', () => {
        it.each([[503], [429], ['ECONNRESET']])(
            'keeps one refresh per call after a transient %s between the retry and its 401',
            async (failure) => {
                const provider = makeProvider({ refusedPaths: ['/scoped'] });
                const store = makeCredentialStore(provider);
                const fetch = failOnce(provider, '/scoped', 2, failure);
                const requester = makeRequester(provider, store, { fetch });

                await expect(get(requester, '/scoped')).rejects.toMatchObject({
                    statusCode: 401,
                });

                expect(provider.tokenCalls).toBe(1);
            }
        );

        it('still refreshes an expired token when a 503 comes before its first 401', async () => {
            const provider = makeProvider();
            const store = makeCredentialStore(provider);
            const fetch = failOnce(provider, '/ok', 1, 503);
            const requester = makeRequester(provider, store, { fetch });
            provider.expireAccessToken();

            await expect(get(requester, '/ok')).resolves.toEqual({ ok: '/ok' });

            expect(provider.tokenCalls).toBe(1);
        });
    });

    describe('known limits', () => {
        it('gives one 401 to a call that adopts an expired stored token, and the next call refreshes', async () => {
            const provider = makeProvider();
            const store = makeCredentialStore(provider);
            const requester = makeRequester(provider, store);
            // Another invocation rotated the pair long ago. The stored access
            // token has expired since then.
            provider.rotations = 1;
            provider.accessToken = 'access-1';
            provider.refreshToken = 'refresh-1';
            store.stored = {
                access_token: 'access-1',
                refresh_token: 'refresh-1',
            };
            provider.expireAccessToken();

            await expect(get(requester, '/ok')).rejects.toMatchObject({
                statusCode: 401,
            });
            expect(provider.tokenCalls).toBe(0);

            await expect(get(requester, '/ok')).resolves.toEqual({ ok: '/ok' });
            expect(provider.tokenCalls).toBe(1);
            expect(store.invalidAuthCalls).toBe(0);
        });
    });

    it('keeps a shared credential alive when concurrent invocations each get a refused fresh token', async () => {
        const provider = makeProvider({ refusedPaths: ['/scoped'] });
        const store = makeCredentialStore(provider);
        const { fetch, held, release } = holdCall(provider, '/token', 1);
        // Two invocations load the same stored credential, and each one
        // handles one webhook: a call that succeeds, then a refused call.
        const invocations = [
            makeRequester(provider, store, { fetch }),
            makeRequester(provider, store, { fetch }),
        ];
        const handleWebhook = async (requester) => {
            await get(requester, '/ok');
            return get(requester, '/scoped');
        };

        const runs = invocations.map(handleWebhook);
        // Both refreshes are in flight. The second one wins the rotation, and
        // the first one then presents a consumed refresh token.
        await held;
        await until(() => provider.rotations === 1);
        release();
        const results = await Promise.allSettled(runs);

        expect(results.map((r) => r.reason?.statusCode)).toEqual([401, 401]);
        expect(provider.rotations).toBe(1);
        expect(provider.tokenCalls).toBe(2);
        expect(store.invalidAuthCalls).toBe(0);
        expect(store.stored.refresh_token).toBe(provider.refreshToken);
        expect(invocations.map((r) => r.refresh_token)).toEqual([
            provider.refreshToken,
            provider.refreshToken,
        ]);
    });

    it('reports each new token that the provider still refuses', async () => {
        const sink = createMemorySink();
        const telemetry = { count: jest.fn() };
        const provider = makeProvider({ refusedPaths: ['/scoped'] });
        const store = makeCredentialStore(provider);
        const requester = makeRequester(provider, store, { telemetry });

        await get(requester, '/scoped').catch(() => {});

        const counted = telemetry.count.mock.calls.filter(
            ([name]) => name === 'frigg.auth.new_token_refused'
        );
        expect(counted).toEqual([
            ['frigg.auth.new_token_refused', 1, { module: expect.any(String) }],
        ]);
        const warnings = sink.records.filter((r) =>
            r.eventName?.endsWith('.new_token_refused')
        );
        expect(warnings).toEqual([
            expect.objectContaining({ level: 'WARN', statusCode: 401 }),
        ]);
    });

    describe('guards for the behavior that does not change', () => {
        it('joins a refresh in flight when that refresh revokes the token of its retry', async () => {
            const provider = makeProvider({ refusedPaths: ['/scoped'] });
            const store = makeCredentialStore(provider);
            const retryHeld = deferred();
            const retryRelease = deferred();
            const mintHeld = deferred();
            const mintRelease = deferred();
            let okCalls = 0;
            let tokenCalls = 0;
            const fetch = jest.fn(async (url, options) => {
                const { pathname } = new URL(url);
                if (pathname === '/ok' && ++okCalls === 2) {
                    retryHeld.resolve();
                    await retryRelease.promise;
                }
                const response = await provider.fetch(url, options);
                if (pathname === '/token' && ++tokenCalls === 2) {
                    mintHeld.resolve();
                    await mintRelease.promise;
                }
                return response;
            });
            const requester = makeRequester(provider, store, { fetch });
            provider.expireAccessToken();

            // The first call refreshes, and its retry waits.
            const first = settled(get(requester, '/ok'));
            await retryHeld.promise;
            // A refused call refreshes too. The provider mints a new pair and
            // revokes the token of the waiting retry, but the requester does
            // not have the response yet.
            const refused = settled(get(requester, '/scoped'));
            await mintHeld.promise;
            retryRelease.resolve();
            await until(() => provider.resourceCalls['/ok'] === 2);
            mintRelease.resolve();

            expect(await first).toEqual({
                status: 'fulfilled',
                value: { ok: '/ok' },
            });
            expect((await refused).reason).toMatchObject({ statusCode: 401 });
            expect(provider.rotations).toBe(2);
            expect(store.invalidAuthCalls).toBe(0);
        });

        it('retries again with the token of a sibling refresh that lands during its own retry', async () => {
            const provider = makeProvider();
            const store = makeCredentialStore(provider);
            const { fetch, held, release } = holdCall(provider, '/slow', 2);
            const requester = makeRequester(provider, store, { fetch });
            provider.expireAccessToken();

            // The first call refreshes, and its retry waits while a sibling
            // finds that token expired and refreshes again.
            const first = get(requester, '/slow');
            await held;
            provider.expireAccessToken();
            await expect(get(requester, '/fast')).resolves.toEqual({
                ok: '/fast',
            });
            release();

            await expect(first).resolves.toEqual({ ok: '/slow' });
            expect(provider.rotations).toBe(2);
            expect(store.invalidAuthCalls).toBe(0);
        });

        it('refreshes an expired token once each time it lapses', async () => {
            const provider = makeProvider();
            const store = makeCredentialStore(provider);
            const requester = makeRequester(provider, store);

            provider.expireAccessToken();
            await expect(get(requester, '/ok')).resolves.toEqual({ ok: '/ok' });
            provider.expireAccessToken();
            await expect(get(requester, '/ok')).resolves.toEqual({ ok: '/ok' });

            expect(provider.tokenCalls).toBe(2);
            expect(store.invalidAuthCalls).toBe(0);
        });

        it('invalidates the credential when the token endpoint rejects the refresh token', async () => {
            const provider = makeProvider();
            const store = makeCredentialStore(provider);
            const requester = makeRequester(provider, store);
            provider.expireAccessToken();
            provider.refreshToken = 'revoked';

            await expect(get(requester, '/ok')).rejects.toMatchObject({
                statusCode: 401,
            });

            expect(provider.tokenCalls).toBe(1);
            expect(store.invalidAuthCalls).toBeGreaterThan(0);
        });
    });
});
