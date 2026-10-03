const crypto = require('node:crypto');
const express = require('express');
const { createManagementApiMetaRouter } = require('./meta-router');
const { createApp } = require('../handlers/app-handler-helpers');
const { request } = require('./test-support/http-client');

const ADMIN_KEY = crypto.randomBytes(16).toString('hex');

const appWith = (managementApi) =>
    createApp((app) =>
        app.use(createManagementApiMetaRouter({ appDefinition: { managementApi } }))
    );

describe('GET /api/meta', () => {
    beforeEach(() => {
        process.env.ADMIN_API_KEY = ADMIN_KEY;
    });
    afterEach(() => {
        delete process.env.ADMIN_API_KEY;
    });

    it('answers without authentication', async () => {
        const res = await request(appWith(), { path: '/api/meta' });
        expect(res.status).toBe(200);
        expect(res.body.api.versions['2'].status).toBe('stable');
        expect(res.body.capabilities).toContain('multiStepAuthorize');
        expect(res.body).not.toHaveProperty('frigg');
        expect(res.headers['cache-control']).toBe('no-store');
    });

    it('adds the core version for a caller with the admin API key', async () => {
        const res = await request(appWith(), {
            path: '/api/meta',
            headers: { 'x-frigg-admin-api-key': ADMIN_KEY },
        });
        expect(res.body.frigg.coreVersion).toBe(
            require('../package.json').version
        );
    });

    it('ignores a wrong admin key rather than rejecting the request', async () => {
        const res = await request(appWith(), {
            path: '/api/meta',
            headers: { 'x-frigg-admin-api-key': 'nope' },
        });
        expect(res.status).toBe(200);
        expect(res.body).not.toHaveProperty('frigg');
    });

    it('reflects the app definition flags', async () => {
        const res = await request(
            appWith({ v1: false, proxy: { enable: true } }),
            { path: '/api/meta' }
        );
        expect(res.body.api.versions['1'].status).toBe('disabled');
        expect(res.body.capabilities).toContain('entityProxy');
    });

    it('does not load the database layer', () => {
        // /api/meta runs on the DB-free health Lambda, so its module graph
        // must not pull in Prisma. Checked in a fresh process.
        const { execFileSync } = require('node:child_process');
        const loaded = execFileSync(
            process.execPath,
            [
                '-e',
                `require(${JSON.stringify(require.resolve('./meta-router'))});` +
                    'process.stdout.write(JSON.stringify(Object.keys(require.cache)))',
            ],
            { encoding: 'utf8' }
        );
        expect(
            JSON.parse(loaded).filter((p) => p.includes('/database/'))
        ).toEqual([]);
    });

    it('serves one OpenAPI document per major', async () => {
        const v2 = await request(appWith(), { path: '/api/meta/openapi/v2.json' });
        expect(v2.status).toBe(200);
        expect(v2.body.openapi).toBe('3.0.3');
        expect(v2.body['x-frigg-api-version']).toBe('2');
        expect(v2.body.paths['/api/v2/integrations'].get.operationId).toBe('listIntegrations');
        expect(v2.body.paths).not.toHaveProperty(['/api/v2/entities/{entityId}/proxy']);

        const v1 = await request(appWith(), { path: '/api/meta/openapi/v1.json' });
        expect(v1.body.paths['/api/integrations'].get.deprecated).toBe(true);

        const missing = await request(appWith(), { path: '/api/meta/openapi/v9.json' });
        expect(missing.status).toBe(404);
        expect(missing.body.error.code).toBe('NOT_FOUND');
    });

    it('documents the entity proxy only when the app enables it', async () => {
        const v2 = await request(appWith({ proxy: { enable: true } }), {
            path: '/api/meta/openapi/v2.json',
        });
        expect(v2.body.paths['/api/v2/entities/{entityId}/proxy'].post['x-frigg-stability']).toBe('beta');
    });

    it('mounts on an existing router without claiming other paths', async () => {
        const app = createApp((a) => {
            a.use(createManagementApiMetaRouter({ appDefinition: {} }));
            a.get('/health', (_req, res) => res.json({ ok: true }));
        });
        const res = await request(app, { path: '/health' });
        expect(res.body).toEqual({ ok: true });
        expect(express).toBeDefined();
    });
});
