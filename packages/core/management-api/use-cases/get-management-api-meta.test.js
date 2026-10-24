const { GetManagementApiMeta } = require('./get-management-api-meta');
const { resolveManagementApiConfig } = require('../management-api-config');

const build = (managementApi) =>
    new GetManagementApiMeta({
        config: resolveManagementApiConfig(managementApi),
        coreVersion: '2.0.1',
    });

describe('GetManagementApiMeta', () => {
    it('lists the supported majors with status and OpenAPI links', () => {
        const meta = build().execute();
        expect(meta.api.preferred).toBe('2');
        expect(meta.api.versions['2']).toEqual({
            status: 'stable',
            openapi: '/api/meta/openapi/v2.json',
        });
        expect(meta.api.versions['1']).toEqual({
            status: 'deprecated',
            deprecatedAt: '2026-11-01',
            sunset: null,
            openapi: '/api/meta/openapi/v1.json',
        });
    });

    it('reports v1 as disabled when the app turns it off', () => {
        const meta = build({ v1: false }).execute();
        expect(meta.api.versions['1'].status).toBe('disabled');
    });

    it('advertises credentials and multi-step authorize, but not the proxy by default', () => {
        const { capabilities } = build().execute();
        expect(capabilities).toEqual(
            expect.arrayContaining(['credentials', 'multiStepAuthorize'])
        );
        expect(capabilities).not.toContain('entityProxy');
        expect(capabilities).not.toContain('reports');
    });

    it('advertises entityProxy only when the app enables it', () => {
        const { capabilities } = build({ proxy: { enable: true } }).execute();
        expect(capabilities).toContain('entityProxy');
    });

    it('discloses the core version only to admin callers', () => {
        expect(build().execute()).not.toHaveProperty('frigg');
        expect(build().execute({ isAdmin: true }).frigg).toEqual({
            coreVersion: '2.0.1',
        });
    });
});
