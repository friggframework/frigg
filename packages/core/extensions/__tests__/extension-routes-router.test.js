const express = require('express');
const { createExtensionRoutesRouter } = require('../route-mounter');
const { createApp } = require('../../handlers/app-handler-helpers');
const { request } = require('../../management-api/test-support/http-client');
const { createMemorySink } = require('../../logs');

function extensionDefinition(handler) {
    return {
        name: 'app',
        integrations: [],
        extensions: [
            {
                name: 'db-credentials',
                routes: { path: '/api/admin/oauth-credentials', handler },
            },
        ],
    };
}

describe('createExtensionRoutesRouter', () => {
    const savedKey = process.env.ADMIN_API_KEY;

    beforeEach(() => {
        createMemorySink();
        process.env.ADMIN_API_KEY = 'admin-secret';
    });

    afterAll(() => {
        if (savedKey === undefined) delete process.env.ADMIN_API_KEY;
        else process.env.ADMIN_API_KEY = savedKey;
    });

    it('serves an extension route behind the admin API key, with prisma and the definition', async () => {
        const prisma = { marker: 'prisma' };
        const handler = jest.fn((p, def) => {
            const r = express.Router();
            r.get('/', (_req, res) => res.json({ prisma: p.marker, app: def.name }));
            return r;
        });
        const app = createApp((a) =>
            a.use(createExtensionRoutesRouter({ appDefinition: extensionDefinition(handler), prisma }))
        );

        const denied = await request(app, { path: '/api/admin/oauth-credentials' });
        expect(denied.status).toBe(401);

        const ok = await request(app, {
            path: '/api/admin/oauth-credentials',
            headers: { 'x-frigg-admin-api-key': 'admin-secret' },
        });
        expect(ok.status).toBe(200);
        expect(ok.body).toEqual({ prisma: 'prisma', app: 'app' });
    });

    it('builds the extension routers once, on the first request, not at creation', async () => {
        const handler = jest.fn(() => express.Router());
        const router = createExtensionRoutesRouter({
            appDefinition: extensionDefinition(handler),
            prisma: {},
        });
        expect(handler).not.toHaveBeenCalled();

        const app = createApp((a) => a.use(router));
        await request(app, { path: '/elsewhere' });
        await request(app, { path: '/elsewhere' });
        expect(handler).toHaveBeenCalledTimes(1);
    });

    it('passes requests through when the app has no extensions', async () => {
        const app = createApp((a) => {
            a.use(createExtensionRoutesRouter({ appDefinition: { integrations: [] } }));
            a.get('/after', (_req, res) => res.json({ reached: true }));
        });

        const res = await request(app, { path: '/after' });
        expect(res.body).toEqual({ reached: true });
    });
});
