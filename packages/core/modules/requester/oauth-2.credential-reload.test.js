const { OAuth2Requester } = require('./oauth-2');

/**
 * ADR-031 option 4: the reactive database check.
 *
 * Before any refresh, and after an invalid_grant, the requester asks its
 * delegate (the Module) for the stored credential via DLGT_CREDENTIAL_RELOAD.
 * If the stored refresh_token differs from the in-memory one, another
 * invocation already refreshed: adopt the stored tokens and do not refresh.
 * Only a definitive authorization rejection with nothing newer in the store
 * may invalidate the credential. Transport failures stay retryable.
 */

/** Minimal delegate double standing in for Module. */
function makeDelegate(storedCredential) {
    return {
        stored: storedCredential,
        reloadCalls: 0,
        invalidAuthCalls: 0,
        async receiveNotification(_notifier, delegateString) {
            if (delegateString === 'CREDENTIAL_RELOAD') {
                this.reloadCalls++;
                if (this.stored instanceof Error) throw this.stored;
                return this.stored;
            }
            if (delegateString === 'INVALID_AUTH') {
                this.invalidAuthCalls++;
            }
        },
    };
}

function makeRequester({ stored, refreshImpl, backoffMs = [0, 0, 0] }) {
    const delegate = makeDelegate(stored);
    const requester = new OAuth2Requester({
        delegate,
        grant_type: 'authorization_code',
        client_id: 'id',
        client_secret: 'secret',
        access_token: 'access-old',
        refresh_token: 'refresh-old',
        requestTimeoutMs: 0,
        credentialReloadBackoffMs: backoffMs,
    });
    if (refreshImpl) {
        requester.refreshAccessToken = jest.fn(refreshImpl);
    }
    return { requester, delegate };
}

function rejectionError(marker) {
    const err = new Error(`Request failed: ${marker}`);
    err.statusCode = 400;
    return err;
}

function transportError(status) {
    const err = new Error(
        status ? `Request failed with status ${status}` : 'socket hang up'
    );
    if (status) err.statusCode = status;
    return err;
}

describe('OAuth2Requester credential reload (ADR-031 option 4)', () => {
    describe('adoption before a refresh', () => {
        it('adopts the stored tokens and skips the refresh when the store is newer', async () => {
            const { requester, delegate } = makeRequester({
                stored: {
                    access_token: 'access-new',
                    refresh_token: 'refresh-new',
                },
                refreshImpl: async () => {
                    throw new Error('refresh must not run');
                },
            });

            const result = await requester.refreshAuth();

            expect(result).toBe(true);
            expect(delegate.reloadCalls).toBe(1);
            expect(requester.refreshAccessToken).not.toHaveBeenCalled();
            expect(requester.access_token).toBe('access-new');
            expect(requester.refresh_token).toBe('refresh-new');
        });

        it('bumps the auth generation on adoption so in-flight 401s retry', async () => {
            const { requester } = makeRequester({
                stored: {
                    access_token: 'access-new',
                    refresh_token: 'refresh-new',
                },
            });
            const generationBefore = requester._authGeneration;

            await requester.refreshAuth();

            expect(requester._authGeneration).toBe(generationBefore + 1);
        });

        it('keys the comparison on the refresh token, not the access token', async () => {
            // A provider can rotate the refresh token and return an access
            // token with an identical string. The winner must still be seen.
            const { requester } = makeRequester({
                stored: {
                    access_token: 'access-old', // identical string
                    refresh_token: 'refresh-new', // rotated
                },
            });

            const result = await requester.refreshAuth();

            expect(result).toBe(true);
            expect(requester.refresh_token).toBe('refresh-new');
        });

        it('refreshes normally when the store holds the same refresh token', async () => {
            const { requester } = makeRequester({
                stored: {
                    access_token: 'access-old',
                    refresh_token: 'refresh-old', // no winner
                },
                refreshImpl: async function () {
                    this.access_token = 'access-refreshed';
                    this.refresh_token = 'refresh-refreshed';
                },
            });

            const result = await requester.refreshAuth();

            expect(result).toBe(true);
            expect(requester.refreshAccessToken).toHaveBeenCalledTimes(1);
        });

        it('treats a reload failure as non-fatal and refreshes normally', async () => {
            const { requester, delegate } = makeRequester({
                stored: new Error('db blip'),
                refreshImpl: async function () {
                    this.access_token = 'access-refreshed';
                },
            });

            const result = await requester.refreshAuth();

            expect(result).toBe(true);
            expect(delegate.invalidAuthCalls).toBe(0);
        });

        it('refreshes normally when no delegate is attached', async () => {
            const requester = new OAuth2Requester({
                grant_type: 'authorization_code',
                access_token: 'a',
                refresh_token: 'r',
                requestTimeoutMs: 0,
            });
            requester.refreshAccessToken = jest.fn(async function () {
                this.access_token = 'a2';
            });

            await expect(requester.refreshAuth()).resolves.toBe(true);
        });
    });

    describe('escalation on a definitive rejection', () => {
        it('recovers from invalid_grant when a re-read finds a newer token', async () => {
            let storedNow = {
                access_token: 'access-old',
                refresh_token: 'refresh-old',
            };
            const { requester, delegate } = makeRequester({
                stored: storedNow,
                refreshImpl: async () => {
                    // The winner lands between our reload and our refresh.
                    delegate.stored = {
                        access_token: 'access-winner',
                        refresh_token: 'refresh-winner',
                    };
                    throw rejectionError('invalid_grant');
                },
            });

            const result = await requester.refreshAuth();

            expect(result).toBe(true);
            expect(requester.access_token).toBe('access-winner');
            expect(delegate.invalidAuthCalls).toBe(0);
        });

        it('invalidates only when rejected AND nothing newer appears', async () => {
            const { requester, delegate } = makeRequester({
                stored: {
                    access_token: 'access-old',
                    refresh_token: 'refresh-old', // never changes: genuinely dead
                },
                refreshImpl: async () => {
                    throw rejectionError('invalid_grant');
                },
            });

            const result = await requester.refreshAuth();

            expect(result).toBe(false);
            expect(delegate.invalidAuthCalls).toBe(1);
            // Initial pre-check + the backoff re-reads all ran.
            expect(delegate.reloadCalls).toBeGreaterThanOrEqual(2);
        });
    });

    describe('transport failures never invalidate', () => {
        it.each([
            ['timeout', transportError(undefined)],
            ['429', transportError(429)],
            ['503', transportError(503)],
        ])('rethrows a %s as retryable without invalidating', async (_name, error) => {
            const { requester, delegate } = makeRequester({
                stored: {
                    access_token: 'access-old',
                    refresh_token: 'refresh-old',
                },
                refreshImpl: async () => {
                    throw error;
                },
            });

            await expect(requester.refreshAuth()).rejects.toThrow(
                /transport failure/i
            );
            expect(delegate.invalidAuthCalls).toBe(0);
        });

        it('preserves the status code on the wrapped transport error', async () => {
            const { requester } = makeRequester({
                stored: {
                    access_token: 'access-old',
                    refresh_token: 'refresh-old',
                },
                refreshImpl: async () => {
                    throw transportError(503);
                },
            });

            await expect(requester.refreshAuth()).rejects.toMatchObject({
                statusCode: 503,
            });
        });

        it('does not leak the original error body on the transport path', async () => {
            // In dev stages a FetchError message embeds the request body,
            // which carries client_secret. The wrapped transport error must
            // not carry that message onward.
            const { requester } = makeRequester({
                stored: {
                    access_token: 'access-old',
                    refresh_token: 'refresh-old',
                },
                refreshImpl: async () => {
                    throw new Error(
                        '{"init":{"body":"client_secret=sk-live-secret"}}'
                    );
                },
            });

            await expect(requester.refreshAuth()).rejects.not.toThrow(
                /sk-live-secret/
            );
        });

        it('treats a 500 whose body mentions invalid_grant as transport', async () => {
            // An error page can echo the request. A 5xx is never a verdict
            // on the credential, whatever its body says.
            const error = transportError(500);
            error.message = 'server error while processing invalid_grant';
            const { requester, delegate } = makeRequester({
                stored: {
                    access_token: 'access-old',
                    refresh_token: 'refresh-old',
                },
                refreshImpl: async () => {
                    throw error;
                },
            });

            await expect(requester.refreshAuth()).rejects.toThrow(
                /transport failure/i
            );
            expect(delegate.invalidAuthCalls).toBe(0);
        });
    });

    describe('status-based rejection detection', () => {
        it('treats an unmarked 400 from the token endpoint as definitive', async () => {
            // Production FetchErrors are body-sanitized (fetch-error.js strips
            // the body outside dev), so a real invalid_grant carries NO marker
            // in prod. Per RFC 6749 §5.2 a token endpoint rejects a bad grant
            // with 400 (invalid_client may use 401), so status is the signal.
            const { requester, delegate } = makeRequester({
                stored: {
                    access_token: 'access-old',
                    refresh_token: 'refresh-old',
                },
                refreshImpl: async () => {
                    throw transportError(400);
                },
            });

            const result = await requester.refreshAuth();

            expect(result).toBe(false);
            expect(delegate.invalidAuthCalls).toBe(1);
        });

        it('treats a statusless SDK error with an OAuth marker as definitive', async () => {
            // intuit-oauth style: no statusCode, the marker rides the message.
            const { requester, delegate } = makeRequester({
                stored: {
                    access_token: 'access-old',
                    refresh_token: 'refresh-old',
                },
                refreshImpl: async () => {
                    throw new Error('invalid_grant');
                },
            });

            const result = await requester.refreshAuth();

            expect(result).toBe(false);
            expect(delegate.invalidAuthCalls).toBe(1);
        });
    });
});
