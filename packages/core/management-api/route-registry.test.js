const {
    MANAGEMENT_API_VERSIONS,
    V1_ROUTES,
    V2_ROUTES,
    META_ROUTES,
    RESERVED_V2_SEGMENTS,
    listRoutes,
    getGatewayRoutes,
    toGatewayPath,
} = require('./route-registry');

describe('Management API route registry', () => {
    it('declares v1 as deprecated and v2 as stable', () => {
        expect(MANAGEMENT_API_VERSIONS['1'].status).toBe('deprecated');
        expect(MANAGEMENT_API_VERSIONS['1'].deprecatedAt).toMatch(
            /^\d{4}-\d{2}-\d{2}$/
        );
        expect(MANAGEMENT_API_VERSIONS['2'].status).toBe('stable');
    });

    it('puts every v2 route under /api/v2 and gives it a unique operationId', () => {
        const ids = new Set();
        for (const route of V2_ROUTES) {
            expect(route.path.startsWith('/api/v2/')).toBe(true);
            expect(route.operationId).toEqual(expect.any(String));
            expect(ids.has(route.operationId)).toBe(false);
            ids.add(route.operationId);
        }
    });

    it('never claims a reserved /api/v2 segment such as reports (ADR-010 owns it)', () => {
        expect(RESERVED_V2_SEGMENTS).toContain('reports');
        const taken = listRoutes({ proxy: true }).filter((r) =>
            RESERVED_V2_SEGMENTS.some(
                (segment) =>
                    r.path === `/api/v2/${segment}` ||
                    r.path.startsWith(`/api/v2/${segment}/`)
            )
        );
        expect(taken).toEqual([]);
        expect(
            getGatewayRoutes({ proxy: true }).filter((r) =>
                r.path.startsWith('/api/v2/reports')
            )
        ).toEqual([]);
    });

    it('lists the entity proxy only when the app enables it (ADR-052)', () => {
        const proxyRoute = (routes) =>
            routes.find((r) => r.operationId === 'proxyEntityRequest');
        expect(proxyRoute(listRoutes())).toBeUndefined();
        expect(proxyRoute(listRoutes({ proxy: true }))).toMatchObject({
            method: 'POST',
            path: '/api/v2/entities/:entityId/proxy',
            stability: 'beta',
        });
    });

    it('keeps v1 routes unprefixed', () => {
        for (const route of V1_ROUTES) {
            expect(route.path.startsWith('/api/v2')).toBe(false);
            expect(route.version).toBe('1');
        }
    });

    it('declares /api/meta as version-neutral', () => {
        expect(META_ROUTES.map((r) => `${r.method} ${r.path}`)).toContain(
            'GET /api/meta'
        );
        for (const route of META_ROUTES) {
            expect(route.version).toBeNull();
            expect(route.function).toBe('health');
        }
    });

    it('drops v1 routes when v1 is disabled', () => {
        const withV1 = listRoutes();
        const withoutV1 = listRoutes({ v1: false });
        expect(withV1.some((r) => r.version === '1')).toBe(true);
        expect(withoutV1.some((r) => r.version === '1')).toBe(false);
        expect(withoutV1.some((r) => r.version === '2')).toBe(true);
    });

    describe('toGatewayPath', () => {
        it('turns Express params into HTTP API params', () => {
            expect(toGatewayPath('/api/v2/entities/:entityId/proxy')).toBe(
                '/api/v2/entities/{entityId}/proxy'
            );
        });
    });

    describe('getGatewayRoutes', () => {
        const key = (r) => `${r.function} ${r.method} ${r.path}`;

        it('declares per-resource v2 routes and never a /api/v2 catch-all', () => {
            const routes = getGatewayRoutes().map(key);
            expect(routes).toEqual(
                expect.arrayContaining([
                    'auth ANY /api/v2/integrations',
                    'auth ANY /api/v2/integrations/{proxy+}',
                    'auth ANY /api/v2/entities',
                    'auth ANY /api/v2/entities/{proxy+}',
                    'auth ANY /api/v2/credentials',
                    'auth ANY /api/v2/credentials/{proxy+}',
                    'auth ANY /api/v2/authorize',
                    'health GET /api/meta',
                ])
            );
            expect(
                getGatewayRoutes().filter(
                    (r) => r.path === '/api/v2/{proxy+}' || r.path === '/api/v2'
                )
            ).toEqual([]);
        });

        it('keeps the v1 routes the auth function already served', () => {
            const routes = getGatewayRoutes().map(key);
            expect(routes).toEqual(
                expect.arrayContaining([
                    'auth ANY /api/integrations',
                    'auth ANY /api/integrations/{proxy+}',
                    'auth ANY /api/authorize',
                    'auth ANY /api/entity',
                    'auth ANY /api/entity/{proxy+}',
                    'auth ANY /api/entities/{proxy+}',
                ])
            );
        });

        it('omits v1 routes but keeps the OAuth redirect when v1 is disabled', () => {
            const routes = getGatewayRoutes({ v1: false }).map(key);
            expect(routes).not.toContain('auth ANY /api/integrations');
            expect(routes).not.toContain('auth ANY /api/authorize');
            expect(routes).not.toContain('auth ANY /api/entity');
            expect(routes).toContain(
                'auth GET /api/integrations/redirect/{appId}'
            );
            expect(routes).toContain('auth ANY /api/v2/integrations');
        });

        it('lists each method + path once', () => {
            const routes = getGatewayRoutes().map(key);
            expect(new Set(routes).size).toBe(routes.length);
        });
    });
});
