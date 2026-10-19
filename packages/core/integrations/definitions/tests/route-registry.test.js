/**
 * DEFINITION_ROUTES is the one list of what the definitions router serves. It must equal what is actually mounted, and the
 * admin routes must sit in core's /admin/* namespace behind the admin key (not /api/admin).
 */
jest.mock('../../../database/config', () => ({ DB_TYPE: 'mongodb', getDatabaseType: jest.fn(() => 'mongodb'), PRISMA_LOG_LEVEL: 'error,warn' }));

const express = require('express');
const request = require('supertest');
const { setIntegrationRuntimeRoutes, DEFINITION_ROUTES } = require('../router');

class Stub { static IntegrationRuntime = { definitions: { list: async () => [] }, manifests: {}, runs: () => null }; }

function mount() {
    const a = express();
    a.use(express.json());
    setIntegrationRuntimeRoutes(a, { execute: async () => ({ getId: () => 'u1' }) }, { getIntegrationInstance: { execute: async () => null }, integrationClasses: [Stub] });
    return a;
}
// What express actually has mounted, as "METHOD path" (admin middleware is registered with .all, so it is not a method here)
function mounted(a) {
    const out = [];
    for (const layer of a._router.stack) {
        if (!layer.route) continue;
        for (const m of Object.keys(layer.route.methods)) if (m !== '_all') out.push(`${m.toUpperCase()} ${layer.route.path}`);
    }
    return out.sort();
}

describe('DEFINITION_ROUTES', () => {
    it('lists exactly the routes the router mounts (method and path)', () => {
        const listed = Object.values(DEFINITION_ROUTES).map((r) => `${r.method} ${r.path}`).sort();
        expect([...new Set(mounted(mount()))]).toEqual([...new Set(listed)]);
    });

    it('declares method, path and auth for every route, and nothing else', () => {
        for (const r of Object.values(DEFINITION_ROUTES)) {
            expect(Object.keys(r).sort()).toEqual(['auth', 'method', 'path']);
            expect(['user', 'admin']).toContain(r.auth);
        }
    });

    it('serves every admin route under /admin/ (never /api/admin) and every user route under /api/', () => {
        for (const r of Object.values(DEFINITION_ROUTES)) {
            if (r.auth === 'admin') { expect(r.path.startsWith('/admin/integrations/')).toBe(true); expect(r.path).not.toMatch(/^\/api\/admin/); }
            else expect(r.path.startsWith('/api/')).toBe(true);
        }
        expect(Object.values(DEFINITION_ROUTES).filter((r) => r.auth === 'admin').map((r) => `${r.method} ${r.path}`).sort()).toEqual([
            'GET /admin/integrations/:definitionId/versions',
            'POST /admin/integrations/:definitionId/versions/:version/deprecate',
            'POST /admin/integrations/versions',
        ]);
    });

    it('every admin route refuses a request without the admin key, and the old /api/admin paths answer 404', async () => {
        process.env.ADMIN_API_KEY = 'k';
        const a = mount();
        expect((await request(a).post('/admin/integrations/versions').send({})).status).toBe(401);
        expect((await request(a).get('/admin/integrations/x/versions')).status).toBe(401);
        expect((await request(a).post('/admin/integrations/x/versions/1.0.0/deprecate')).status).toBe(401);
        expect((await request(a).post('/api/admin/integrations/versions').set('x-frigg-admin-api-key', 'k').send({})).status).toBe(404);
    });
});
