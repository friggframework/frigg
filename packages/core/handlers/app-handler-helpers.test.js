const express = require('express');
const Boom = require('@hapi/boom');
const { createApp } = require('./app-handler-helpers');
const { createMemorySink } = require('../logs');
const { SECRETS } = require('../logs/__fixtures__/secrets');

async function request(router, { path = '/fail', headers = {} } = {}) {
    const app = createApp((a) => a.use(router));
    const server = await new Promise((resolve) => {
        const s = app.listen(0, () => resolve(s));
    });
    try {
        const { port } = server.address();
        const res = await fetch(`http://127.0.0.1:${port}${path}`, { headers });
        return { status: res.status, body: await res.json() };
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
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
        expect(byEvent('frigg.legacy.error')).toHaveLength(0);
        expect(sink.records).toContainNoSecretWindow([SECRETS.bearer, SECRETS.friggApiKey]);
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
        expect(rejected[0]).toMatchObject({ level: 'WARN', statusCode: 404, error: { message: 'No such integration' } });
        expect(sink.records.filter((r) => r.level === 'ERROR')).toHaveLength(0);
    });
});
