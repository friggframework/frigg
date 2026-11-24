const express = require('express');
const Boom = require('@hapi/boom');
const { createApp } = require('./app-handler-helpers');
const { createMemorySink } = require('../logs');
const { SECRETS } = require('../logs/__fixtures__/secrets');
const { ClientSafeError, FetchError, RateLimitError } = require('../errors');

async function send(router, { path = '/fail', headers = {} } = {}) {
    const app = createApp((a) => a.use(router));
    const server = await new Promise((resolve) => {
        const s = app.listen(0, () => resolve(s));
    });
    try {
        const { port } = server.address();
        const res = await fetch(`http://127.0.0.1:${port}${path}`, { headers });
        return { status: res.status, headers: res.headers, body: await res.json() };
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
}

async function request(router, options) {
    const { status, body } = await send(router, options);
    return { status, body };
}

describe('createApp error middleware (ADR-048 Phase 2)', () => {
    let sink;
    let consoleSpies;

    beforeEach(() => {
        sink = createMemorySink();
        consoleSpies = ['log', 'warn', 'error', 'debug'].map((m) =>
            jest.spyOn(console, m).mockImplementation(() => {})
        );
    });
    afterEach(() => {
        for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
        jest.restoreAllMocks();
    });

    const byEvent = (eventName) => sink.records.filter((r) => r.eventName === eventName);

    it('logs one frigg.http.request_failed for a 500 and leaks no header value', async () => {
        const router = express.Router();
        router.get('/fail', (req) => {
            throw new Error(`upstream said no to ${req.headers.authorization}`);
        });
        const res = await request(router, {
            headers: { Authorization: `Bearer ${SECRETS.bearer}`, 'x-frigg-api-key': SECRETS.friggApiKey },
        });

        expect(res).toEqual({ status: 500, body: { error: 'Internal Server Error' } });
        const failed = byEvent('frigg.http.request_failed');
        expect(failed).toHaveLength(1);
        expect(failed[0]).toMatchObject({
            level: 'ERROR',
            logger: 'frigg.http',
            statusCode: 500,
            error: { type: 'Error' },
        });
        expect(failed[0].invocation).toEqual({
            source: 'http',
            method: 'GET',
            path: '/fail',
            queryKeys: [],
            headerNames: expect.arrayContaining(['authorization', 'x-frigg-api-key']),
        });
        expect(byEvent('frigg.legacy.error')).toHaveLength(0);
        expect(sink.records).toContainNoSecretWindow([SECRETS.bearer, SECRETS.friggApiKey]);
    });

    it('redacts the path and keeps only query keys on the 500 record', async () => {
        const router = express.Router();
        router.get('/keys/:key', () => {
            throw new Error('boom');
        });
        await request(router, { path: `/keys/${SECRETS.hexToken}?api_key=${SECRETS.apiKeyQuery}` });
        const [failed] = byEvent('frigg.http.request_failed');
        expect(failed.invocation).toMatchObject({ path: '/keys/[REDACTED:40]', queryKeys: ['api_key'] });
        expect(sink.records).toContainNoSecretWindow([SECRETS.hexToken, SECRETS.apiKeyQuery]);
    });

    it('scrubs the reason of a 4xx', async () => {
        const router = express.Router();
        router.get('/fail', () => {
            throw Boom.unauthorized(`bad token Authorization: Bearer ${SECRETS.bearer}`);
        });
        const res = await request(router);
        expect(res.status).toBe(401);
        expect(byEvent('frigg.http.request_rejected')).toHaveLength(1);
        expect(sink.records).toContainNoSecretWindow([SECRETS.bearer]);
    });

    it('logs one WARN frigg.http.request_rejected for a 4xx and returns the message', async () => {
        const router = express.Router();
        router.get('/fail', () => {
            throw Boom.notFound('No such integration');
        });
        const res = await request(router);

        expect(res).toEqual({ status: 404, body: { error: 'No such integration' } });
        const rejected = byEvent('frigg.http.request_rejected');
        expect(rejected).toHaveLength(1);
        expect(rejected[0]).toMatchObject({ level: 'WARN', statusCode: 404, reason: 'No such integration' });
        expect(rejected[0]).not.toHaveProperty('error');
        expect(JSON.stringify(rejected[0])).not.toMatch(/\n\s+at /);
        expect(sink.records.filter((r) => r.level === 'ERROR')).toHaveLength(0);
    });

    const failingWith = (error) => {
        const router = express.Router();
        router.get('/fail', () => {
            throw error;
        });
        return router;
    };

    it('answers an expired session token with 401 and its user-safe message', async () => {
        const res = await request(
            failingWith(new ClientSafeError('Invalid Token: Token is expired', 401))
        );

        expect(res).toEqual({ status: 401, body: { error: 'Invalid Token: Token is expired' } });
        expect(byEvent('frigg.http.request_rejected')).toHaveLength(1);
        expect(byEvent('frigg.http.request_failed')).toHaveLength(0);
    });

    it.each([403, 404])('keeps the %i of a ClientSafeError', async (statusCode) => {
        const res = await request(failingWith(new ClientSafeError('Not yours', statusCode)));

        expect(res).toEqual({ status: statusCode, body: { error: 'Not yours' } });
    });

    it('hides the message of a 5xx ClientSafeError but keeps its status', async () => {
        const res = await request(failingWith(new ClientSafeError('db down', 503)));

        expect(res).toEqual({ status: 503, body: { error: 'Internal Server Error' } });
        expect(byEvent('frigg.http.request_failed')).toHaveLength(1);
    });

    it.each([200, 302, 600, '401', 'nope'])(
        'answers 500 without the message for a ClientSafeError with statusCode %p',
        async (statusCode) => {
            const res = await request(failingWith(new ClientSafeError('odd status', statusCode)));

            expect(res).toEqual({ status: 500, body: { error: 'Internal Server Error' } });
        }
    );

    describe('a rate limit', () => {
        const PROVIDER_URL = 'https://api.example.com/contacts?page=2';

        it('answers 429 with Retry-After from retryAt and hides the provider details', async () => {
            const error = new RateLimitError({
                resource: PROVIDER_URL,
                response: { status: 429 },
                hint: { reason: 'daily' },
                waitMs: 30_000,
            });
            const res = await send(failingWith(error));

            expect(res.status).toBe(429);
            expect(res.headers.get('retry-after')).toBe('30');
            expect(res.body).toEqual({
                error: 'Too Many Requests',
                retryAt: error.retryAt.toISOString(),
            });
        });

        it('logs one WARN frigg.http.request_rate_limited with the retry time', async () => {
            const error = new RateLimitError({
                resource: PROVIDER_URL,
                hint: { reason: 'daily' },
                waitMs: 30_000,
            });
            await send(failingWith(error));

            const limited = byEvent('frigg.http.request_rate_limited');
            expect(limited).toHaveLength(1);
            expect(limited[0]).toMatchObject({
                level: 'WARN',
                statusCode: 429,
                error: { retryAt: error.retryAt.toISOString(), reason: 'daily' },
            });
            expect(byEvent('frigg.http.request_failed')).toHaveLength(0);
            expect(sink.records.filter((r) => r.level === 'ERROR')).toHaveLength(0);
        });

        it('sends no Retry-After when the retry time is unknown', async () => {
            const res = await send(failingWith(new RateLimitError({ resource: PROVIDER_URL })));

            expect(res.status).toBe(429);
            expect(res.headers.get('retry-after')).toBeNull();
            expect(res.body).toEqual({ error: 'Too Many Requests' });
        });

        it('answers 429 for any error flagged isRateLimited', async () => {
            const error = Object.assign(new Error('token endpoint limited'), {
                isRateLimited: true,
                retryAt: new Date(Date.now() + 5_000),
            });
            const res = await send(failingWith(error));

            expect(res.status).toBe(429);
            expect(res.headers.get('retry-after')).toBe('5');
        });

        it('sends Retry-After 0 when the retry time is past', async () => {
            const error = Object.assign(new Error('limited'), {
                isRateLimited: true,
                retryAt: new Date(Date.now() - 5_000),
            });
            const res = await send(failingWith(error));

            expect(res.headers.get('retry-after')).toBe('0');
        });
    });

    it('does not pass an upstream status through for an error that is not client-safe', async () => {
        const res = await request(
            failingWith(new FetchError({ resource: 'https://api.example.com/x', response: { status: 401 } }))
        );

        expect(res).toEqual({ status: 500, body: { error: 'Internal Server Error' } });
    });
});
