const express = require('express');
const { createApp } = require('../handlers/app-handler-helpers');
const { request } = require('./test-support/http-client');
const { createMemorySink } = require('../logs');
const {
    createV1DeprecationRouter,
    createV1DisabledRouter,
    deprecationHeaderValue,
} = require('./v1-deprecation');
const { V1_ROUTES } = require('./route-registry');

function v1App(deprecation) {
    return createApp((app) => {
        app.use(deprecation);
        // Stand-ins for the frozen v1 handlers.
        app.get('/api/integrations', (_req, res) => res.json({ integrations: [] }));
        app.get('/api/entities/:entityId', (req, res) =>
            res.json({ id: req.params.entityId })
        );
        app.all('/api/integrations/:integrationId/actions', (_req, res) =>
            res.json({ actions: [] })
        );
        app.get('/api/integrations/redirect/:appId', (_req, res) => res.json({ ok: true }));
    });
}

describe('v1 deprecation signals (ADR-053 §6)', () => {
    let sink;
    let telemetry;

    beforeEach(() => {
        sink = createMemorySink();
        telemetry = { count: jest.fn() };
    });

    it('formats the RFC 9745 Deprecation value as an epoch-seconds structured date', () => {
        expect(deprecationHeaderValue('2026-11-01')).toBe(
            `@${Date.UTC(2026, 10, 1) / 1000}`
        );
    });

    it('adds Deprecation and a deprecation Link to a v1 response without changing the body', async () => {
        const res = await request(v1App(createV1DeprecationRouter({ telemetry })), {
            path: '/api/integrations',
        });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ integrations: [] });
        expect(res.headers.deprecation).toBe(deprecationHeaderValue('2026-11-01'));
        expect(res.headers.link).toBe(
            '<https://docs.friggframework.org/api/migrate-v1-v2>; rel="deprecation"; type="text/html"'
        );
        expect(res.headers).not.toHaveProperty('sunset');
        expect(res.headers).not.toHaveProperty('frigg-api-version');
    });

    it('logs one frigg.api.deprecated_route record with the route template and client', async () => {
        await request(v1App(createV1DeprecationRouter({ telemetry })), {
            path: '/api/entities/42',
            headers: { 'Frigg-Client': '@friggframework/ui/2.0.0' },
        });
        const records = sink.records.filter(
            (r) => r.eventName === 'frigg.api.deprecated_route'
        );
        expect(records).toHaveLength(1);
        expect(records[0]).toMatchObject({
            level: 'INFO',
            route: '/api/entities/:entityId',
            method: 'GET',
            client: '@friggframework/ui/2.0.0',
        });
        expect(JSON.stringify(records[0])).not.toContain('/api/entities/42');
    });

    it('counts v1 usage with bounded labels', async () => {
        await request(v1App(createV1DeprecationRouter({ telemetry })), {
            method: 'POST',
            path: '/api/integrations/7/actions',
        });
        expect(telemetry.count).toHaveBeenCalledWith('frigg.api.v1.requests', 1, {
            route: '/api/integrations/:integrationId/actions',
            method: 'POST',
        });
    });

    it('leaves the OAuth redirect alone', async () => {
        const res = await request(v1App(createV1DeprecationRouter({ telemetry })), {
            path: '/api/integrations/redirect/hubspot',
        });
        expect(res.headers).not.toHaveProperty('deprecation');
        expect(telemetry.count).not.toHaveBeenCalled();
    });

    it('still signals when telemetry throws', async () => {
        telemetry.count.mockImplementation(() => {
            throw new Error('exporter down');
        });
        const res = await request(v1App(createV1DeprecationRouter({ telemetry })), {
            path: '/api/integrations',
        });
        expect(res.status).toBe(200);
        expect(res.headers.deprecation).toBeDefined();
    });
});

describe('managementApi.v1: false', () => {
    it('answers every v1 route with 410 and a link to the migration guide', async () => {
        const app = createApp((a) => a.use(createV1DisabledRouter()));
        for (const { method, path } of V1_ROUTES) {
            const concrete = path.replace(/:([A-Za-z]+)/g, 'x');
            const res = await request(app, {
                method: method === 'ANY' ? 'GET' : method,
                path: concrete,
            });
            expect([path, res.status]).toEqual([path, 410]);
            expect(res.body.error.code).toBe('API_VERSION_DISABLED');
            expect(res.headers.link).toContain('rel="deprecation"');
        }
    });

    it('does not claim the OAuth redirect', async () => {
        const app = createApp((a) => {
            a.use(createV1DisabledRouter());
            a.get('/api/integrations/redirect/:appId', (_req, res) => res.json({ ok: true }));
        });
        const res = await request(app, { path: '/api/integrations/redirect/hubspot' });
        expect(res.status).toBe(200);
        expect(express).toBeDefined();
    });
});
