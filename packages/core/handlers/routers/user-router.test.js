const express = require('express');
const request = require('supertest');
const Boom = require('@hapi/boom');
const { buildUserRouter } = require('./user-router');
const { FixedWindowRateLimiter } = require('../rate-limiter');

// Mount the router under test on a minimal app with JSON parsing and a Boom
// error mapper mirroring app-handler-helpers, so status codes are asserted
// end-to-end.
function mountApp(router) {
    const app = express();
    app.use(express.json());
    app.use(router);
    app.use((err, req, res, _next) => {
        const boom = err.isBoom ? err : Boom.boomify(err);
        res.status(boom.output.statusCode).json({
            error: boom.message,
        });
    });
    return app;
}

function makeDeps(overrides = {}) {
    const loginUser = {
        execute: jest.fn().mockResolvedValue({ getId: () => 'user-1' }),
    };
    const createIndividualUser = {
        execute: jest.fn().mockResolvedValue({ getId: () => 'user-1' }),
    };
    const createTokenForUserId = {
        execute: jest.fn().mockResolvedValue('friggtoken-abc'),
    };
    const loginWithApiKey = {
        execute: jest.fn().mockResolvedValue({
            token: 'apikey-session-xyz',
            userId: 'org-1',
            module: 'reevo',
        }),
    };
    const apiKeyLoginLimiter = new FixedWindowRateLimiter({
        windowMs: 60000,
        maxPerKey: 3,
        maxGlobal: 1000,
    });

    return {
        userConfig: {
            authModes: { friggToken: true, apiKey: { module: 'reevo' } },
        },
        loginUser,
        createIndividualUser,
        createTokenForUserId,
        loginWithApiKey,
        apiKeyLoginLimiter,
        ...overrides,
    };
}

describe('POST /user/login (polymorphic)', () => {
    const OLD_STAGE = process.env.STAGE;
    beforeAll(() => {
        process.env.STAGE = 'test'; // secure cookie off in local stages
    });
    afterAll(() => {
        process.env.STAGE = OLD_STAGE;
    });

    describe('apiKey body', () => {
        it('dispatches { apiKey } to the apiKey mode and returns a token + hardened cookie', async () => {
            const deps = makeDeps();
            const app = mountApp(buildUserRouter(deps));

            const res = await request(app)
                .post('/user/login')
                .send({ apiKey: 'sk_live_abc' });

            expect(res.status).toBe(201);
            expect(res.body).toEqual({ token: 'apikey-session-xyz' });
            expect(deps.loginWithApiKey.execute).toHaveBeenCalledWith({
                apiKey: 'sk_live_abc',
                module: undefined,
            });
            // Password path was NOT taken.
            expect(deps.loginUser.execute).not.toHaveBeenCalled();

            // Cookie hygiene (ADR-034 §7).
            const cookie = res.headers['set-cookie'][0];
            expect(cookie).toMatch(/^frigg_session=apikey-session-xyz/);
            expect(cookie).toMatch(/HttpOnly/i);
            expect(cookie).toMatch(/SameSite=Strict/i);
            expect(cookie).not.toMatch(/Secure/i); // local stage
        });

        it('passes an allowlisted { module } through to the use case', async () => {
            const deps = makeDeps();
            const app = mountApp(buildUserRouter(deps));

            await request(app)
                .post('/user/login')
                .send({ apiKey: 'sk_live_abc', module: 'reevo' })
                .expect(201);

            expect(deps.loginWithApiKey.execute).toHaveBeenCalledWith({
                apiKey: 'sk_live_abc',
                module: 'reevo',
            });
        });

        it('returns a generic 401 for an { apiKey } body when apiKey mode is disabled', async () => {
            const deps = makeDeps({ loginWithApiKey: null });
            const app = mountApp(buildUserRouter(deps));

            const res = await request(app)
                .post('/user/login')
                .send({ apiKey: 'sk_live_abc' });

            expect(res.status).toBe(401);
            expect(res.body.error).toBe('Invalid credentials');
        });

        it('surfaces a 503 from the use case (provider outage) without minting a session', async () => {
            const deps = makeDeps();
            deps.loginWithApiKey.execute = jest
                .fn()
                .mockRejectedValue(
                    Boom.serverUnavailable('Identity provider unavailable')
                );
            const app = mountApp(buildUserRouter(deps));

            const res = await request(app)
                .post('/user/login')
                .send({ apiKey: 'sk_live_abc' });

            expect(res.status).toBe(503);
            expect(res.headers['set-cookie']).toBeUndefined();
        });

        it('trips the rate limit after maxPerKey attempts (429)', async () => {
            const deps = makeDeps();
            const app = mountApp(buildUserRouter(deps));

            // maxPerKey = 3 → 3 allowed, 4th blocked.
            for (let i = 0; i < 3; i++) {
                await request(app)
                    .post('/user/login')
                    .send({ apiKey: 'sk_live_abc' })
                    .expect(201);
            }
            const res = await request(app)
                .post('/user/login')
                .send({ apiKey: 'sk_live_abc' });
            expect(res.status).toBe(429);
        });

        it('rotating the LEFTMOST X-Forwarded-For hop does NOT mint a fresh bucket (spoof-resistant)', async () => {
            const deps = makeDeps(); // maxPerKey = 3
            const app = mountApp(buildUserRouter(deps));

            // Attacker rotates the client-controlled leftmost hop on every
            // request but the trusted rightmost hop (stamped by the proxy) is
            // constant. With a trusted-position IP the bucket is shared, so the
            // 4th request still trips. (Under the old split(',')[0] behavior each
            // request would land in a new bucket and all four would be 201.)
            for (let i = 0; i < 3; i++) {
                await request(app)
                    .post('/user/login')
                    .set('X-Forwarded-For', `10.0.0.${i}, 203.0.113.7`)
                    .send({ apiKey: 'sk_live_abc' })
                    .expect(201);
            }
            const res = await request(app)
                .post('/user/login')
                .set('X-Forwarded-For', '10.0.0.99, 203.0.113.7')
                .send({ apiKey: 'sk_live_abc' });
            expect(res.status).toBe(429);
        });

        it('honors trustedProxyDepth to pick the client IP N hops from the right', async () => {
            const deps = makeDeps({
                userConfig: {
                    authModes: {
                        apiKey: {
                            module: 'reevo',
                            rateLimit: { trustedProxyDepth: 2 },
                        },
                    },
                },
            });
            const app = mountApp(buildUserRouter(deps));

            // XFF = spoof, client, proxy. With 2 trusted hops the client IP is
            // the entry 2 from the right (index length-2). Keeping THAT constant
            // while the spoofable leftmost hop and the rightmost proxy vary must
            // still share a bucket and trip at #4.
            for (let i = 0; i < 3; i++) {
                await request(app)
                    .post('/user/login')
                    .set(
                        'X-Forwarded-For',
                        `10.0.0.${i}, 198.51.100.5, 172.16.0.${i}`
                    )
                    .send({ apiKey: 'sk_live_abc' })
                    .expect(201);
            }
            const res = await request(app)
                .post('/user/login')
                .set('X-Forwarded-For', '10.0.0.9, 198.51.100.5, 172.16.0.9')
                .send({ apiKey: 'sk_live_abc' });
            expect(res.status).toBe(429);
        });

        it('sets a cookie Max-Age aligned to the token TTL', async () => {
            const deps = makeDeps();
            deps.loginWithApiKey.tokenExpiryMinutes = 30;
            const app = mountApp(buildUserRouter(deps));

            const res = await request(app)
                .post('/user/login')
                .send({ apiKey: 'sk_live_abc' })
                .expect(201);

            const cookie = res.headers['set-cookie'][0];
            // 30 minutes = 1800 seconds.
            expect(cookie).toMatch(/Max-Age=1800\b/i);
            expect(cookie).toMatch(/Expires=/i);
        });
    });

    describe('CSRF origin allowlist', () => {
        it('rejects a disallowed Origin with 403 when allowedOrigins is configured', async () => {
            const deps = makeDeps({
                userConfig: {
                    authModes: {
                        apiKey: {
                            module: 'reevo',
                            allowedOrigins: ['https://app.example.com'],
                        },
                    },
                },
            });
            const app = mountApp(buildUserRouter(deps));

            const res = await request(app)
                .post('/user/login')
                .set('Origin', 'https://evil.example.com')
                .send({ apiKey: 'sk_live_abc' });

            expect(res.status).toBe(403);
            expect(deps.loginWithApiKey.execute).not.toHaveBeenCalled();
        });

        it('allows a listed Origin', async () => {
            const deps = makeDeps({
                userConfig: {
                    authModes: {
                        apiKey: {
                            module: 'reevo',
                            allowedOrigins: ['https://app.example.com'],
                        },
                    },
                },
            });
            const app = mountApp(buildUserRouter(deps));

            await request(app)
                .post('/user/login')
                .set('Origin', 'https://app.example.com')
                .send({ apiKey: 'sk_live_abc' })
                .expect(201);
        });
    });

    describe('password body (friggToken) — UNCHANGED when both modes enabled', () => {
        it('logs in with { username, password } and never touches the apiKey path', async () => {
            const deps = makeDeps(); // both friggToken + apiKey enabled
            const app = mountApp(buildUserRouter(deps));

            const res = await request(app)
                .post('/user/login')
                .send({ username: 'alice', password: 'pw' });

            expect(res.status).toBe(201);
            expect(res.body).toEqual({ token: 'friggtoken-abc' });
            expect(deps.loginUser.execute).toHaveBeenCalledWith({
                username: 'alice',
                password: 'pw',
            });
            expect(deps.loginWithApiKey.execute).not.toHaveBeenCalled();
            // No cookie on the (unchanged) password path.
            expect(res.headers['set-cookie']).toBeUndefined();
        });

        it('still 400s a password login missing a field', async () => {
            const deps = makeDeps();
            const app = mountApp(buildUserRouter(deps));

            const res = await request(app)
                .post('/user/login')
                .send({ username: 'alice' });

            expect(res.status).toBe(400);
        });
    });
});
