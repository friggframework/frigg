const express = require('express');
const Boom = require('@hapi/boom');
const { createApp } = require('./app-handler-helpers');
const { request } = require('../management-api/test-support/http-client');
const { createMemorySink } = require('../logs');

function appWith(register) {
    const router = express.Router();
    register(router);
    return createApp((a) => a.use(router));
}

describe('createApp error boundary: status and Management API v2 format', () => {
    beforeEach(() => {
        createMemorySink();
    });

    describe('status', () => {
        it('keeps a body-parser 400 as 400 instead of turning it into a 500', async () => {
            const app = appWith((r) => r.post('/api/integrations', (_req, res) => res.json({})));
            const res = await request(app, {
                method: 'POST',
                path: '/api/integrations',
                headers: { 'content-type': 'application/json' },
                rawBody: '{"broken":',
            });
            expect(res.status).toBe(400);
            // v1 keeps its { error: message } shape.
            expect(typeof res.body.error).toBe('string');
        });

        it('keeps an exposed 4xx status from http-errors style errors', async () => {
            const app = appWith((r) =>
                r.get('/x', () => {
                    const err = new Error('Gone fishing');
                    err.status = 409;
                    err.expose = true;
                    throw err;
                })
            );
            const res = await request(app, { path: '/x' });
            expect(res.status).toBe(409);
        });

        it('does not trust a status on a non-exposed error (e.g. an upstream FetchError)', async () => {
            const app = appWith((r) =>
                r.get('/x', () => {
                    const err = new Error('GET https://upstream 404');
                    err.statusCode = 404;
                    throw err;
                })
            );
            const res = await request(app, { path: '/x' });
            expect(res.status).toBe(500);
            expect(res.body).toEqual({ error: 'Internal Server Error' });
        });
    });

    describe('v2 JSON error shape', () => {
        it('wraps a Boom 404 as { error: { code, message } } with the API version header', async () => {
            const app = appWith((r) =>
                r.get('/api/v2/things/:id', () => {
                    throw Boom.notFound('Thing not found');
                })
            );
            const res = await request(app, { path: '/api/v2/things/1' });
            expect(res.status).toBe(404);
            expect(res.body).toEqual({
                error: { code: 'NOT_FOUND', message: 'Thing not found' },
            });
            expect(res.headers['frigg-api-version']).toBe('2');
        });

        it('uses the code and details a use case attached', async () => {
            const app = appWith((r) =>
                r.get('/api/v2/things', () => {
                    throw Boom.forbidden('Module hubspot cannot be proxied', {
                        code: 'PROXY_NOT_ALLOWED',
                        details: { module: 'hubspot' },
                    });
                })
            );
            const res = await request(app, { path: '/api/v2/things' });
            expect(res.status).toBe(403);
            expect(res.body).toEqual({
                error: {
                    code: 'PROXY_NOT_ALLOWED',
                    message: 'Module hubspot cannot be proxied',
                    details: { module: 'hubspot' },
                },
            });
        });

        it('reports invalid JSON on a v2 route as 400 INVALID_JSON', async () => {
            const app = appWith((r) => r.post('/api/v2/things', (_req, res) => res.json({})));
            const res = await request(app, {
                method: 'POST',
                path: '/api/v2/things',
                headers: { 'content-type': 'application/json' },
                rawBody: '{"broken":',
            });
            expect(res.status).toBe(400);
            expect(res.body.error.code).toBe('INVALID_JSON');
            expect(res.headers['frigg-api-version']).toBe('2');
        });

        it('hides the message of an unexpected 500', async () => {
            const app = appWith((r) =>
                r.get('/api/v2/things', () => {
                    throw new Error('db password is hunter2');
                })
            );
            const res = await request(app, { path: '/api/v2/things' });
            expect(res.status).toBe(500);
            expect(res.body).toEqual({
                error: { code: 'INTERNAL_ERROR', message: 'Internal Server Error' },
            });
        });

        it('passes a 5xx message through only when the error marks it safe', async () => {
            const app = appWith((r) =>
                r.get('/api/v2/things', () => {
                    throw Boom.gatewayTimeout('Upstream API timed out', {
                        code: 'TIMEOUT',
                        expose: true,
                    });
                })
            );
            const res = await request(app, { path: '/api/v2/things' });
            expect(res.status).toBe(504);
            expect(res.body).toEqual({
                error: { code: 'TIMEOUT', message: 'Upstream API timed out' },
            });
        });

        it('formats /api/meta errors the v2 way', async () => {
            const app = appWith((r) =>
                r.get('/api/meta/openapi/v9.json', () => {
                    throw Boom.notFound('No such API version');
                })
            );
            const res = await request(app, { path: '/api/meta/openapi/v9.json' });
            expect(res.body.error.code).toBe('NOT_FOUND');
        });
    });
});
