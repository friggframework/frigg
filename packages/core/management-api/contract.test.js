/**
 * Contract: the route registry is the single source for the Express routers
 * and the OpenAPI documents (ADR-053 §5). The API Gateway side is checked in
 * packages/devtools/infrastructure/__tests__/management-api-gateway-routes.test.js.
 */
jest.mock('../handlers/app-definition-loader', () => ({
    loadAppDefinition: () => ({ integrations: [], userConfig: {} }),
}));
jest.mock('../integrations/repositories/integration-repository-factory', () => ({
    createIntegrationRepository: () => ({}),
}));
jest.mock('../credential/repositories/credential-repository-factory', () => ({
    createCredentialRepository: () => ({}),
}));
jest.mock('../modules/repositories/module-repository-factory', () => ({
    createModuleRepository: () => ({}),
}));
jest.mock('../user/repositories/user-repository-factory', () => ({
    createUserRepository: () => ({}),
}));
jest.mock('../modules/repositories/authorization-session-repository-factory', () => ({
    createAuthorizationSessionRepository: () => ({}),
}));

const {
    V1_ROUTES,
    META_ROUTES,
    MANAGEMENT_API_VERSIONS,
    listV2Routes,
    toGatewayPath,
} = require('./route-registry');
const { createManagementApiV2Router, createV2Handlers } = require('./v2/create-v2-router');
const { buildV2Dependencies } = require('./v2/dependencies');
const { createManagementApiMetaRouter } = require('./meta-router');
const { createIntegrationRouter } = require('../integrations/integration-router');
const { buildOpenApiDocument } = require('./openapi/build-openapi');
const { resolveManagementApiConfig } = require('./management-api-config');

const key = ({ method, path }) => `${method} ${path}`;

function expressRoutes(router) {
    const stack = (router._router || router).stack;
    const routes = [];
    for (const layer of stack) {
        if (!layer.route) continue;
        for (const method of Object.keys(layer.route.methods)) {
            routes.push({
                method: method === '_all' ? 'ANY' : method.toUpperCase(),
                path: layer.route.path,
            });
        }
    }
    return routes;
}

function openApiRoutes(document) {
    const routes = [];
    for (const [path, operations] of Object.entries(document.paths)) {
        for (const method of Object.keys(operations)) {
            routes.push({ method: method.toUpperCase(), path });
        }
    }
    return routes;
}

const asOpenApi = (routes) =>
    routes.flatMap((r) =>
        r.method === 'ANY'
            ? [
                  { method: 'GET', path: toGatewayPath(r.path) },
                  { method: 'POST', path: toGatewayPath(r.path) },
              ]
            : [{ method: r.method, path: toGatewayPath(r.path) }]
    );

describe('Management API contract: registry == router == OpenAPI', () => {
    const previousDbType = process.env.DB_TYPE;
    beforeAll(() => {
        process.env.DB_TYPE = 'postgresql';
    });
    afterAll(() => {
        if (previousDbType === undefined) delete process.env.DB_TYPE;
        else process.env.DB_TYPE = previousDbType;
    });

    describe.each([
        ['proxy disabled', false],
        ['proxy enabled', true],
    ])('v2 with the %s', (_label, proxy) => {
        const config = resolveManagementApiConfig({ proxy: { enable: proxy } });
        const dependencies = buildV2Dependencies({ appDefinition: {}, config });

        it('has a handler for every registered operation', () => {
            const handlers = createV2Handlers(dependencies);
            const missing = listV2Routes({ proxy })
                .map((r) => r.operationId)
                .filter((id) => typeof handlers[id] !== 'function');
            expect(missing).toEqual([]);
        });

        it('mounts exactly the registry routes, in registry order', () => {
            const router = createManagementApiV2Router({ appDefinition: {}, config, dependencies });
            expect(expressRoutes(router).map(key)).toEqual(listV2Routes({ proxy }).map(key));
        });

        it('documents exactly the registry routes', () => {
            const documented = openApiRoutes(buildOpenApiDocument('2', { proxy }));
            const expected = asOpenApi([...listV2Routes({ proxy }), ...META_ROUTES]);
            expect(documented.map(key).sort()).toEqual(expected.map(key).sort());
        });
    });

    it('v1: the frozen router serves exactly the registered v1 routes', () => {
        expect(expressRoutes(createIntegrationRouter()).map(key)).toEqual(V1_ROUTES.map(key));
    });

    it('v1: the OpenAPI document lists every v1 route as deprecated', () => {
        const document = buildOpenApiDocument('1');
        const documented = openApiRoutes(document);
        expect(documented.map(key).sort()).toEqual(
            asOpenApi([...V1_ROUTES, ...META_ROUTES]).map(key).sort()
        );
        for (const route of asOpenApi(V1_ROUTES)) {
            expect(document.paths[route.path][route.method.toLowerCase()].deprecated).toBe(true);
        }
    });

    it('meta: the meta router serves the registered meta routes', () => {
        const router = createManagementApiMetaRouter({ appDefinition: {} });
        expect(expressRoutes(router).map(key)).toEqual(META_ROUTES.map(key));
        expect(META_ROUTES.map((r) => r.path)).toEqual([
            '/api/meta',
            ...Object.keys(MANAGEMENT_API_VERSIONS).map((m) => `/api/meta/openapi/v${m}.json`),
        ]);
    });

    it('every OpenAPI operationId is unique and every $ref resolves', () => {
        for (const major of Object.keys(MANAGEMENT_API_VERSIONS)) {
            const document = buildOpenApiDocument(major);
            const ids = openApiRoutes(document).map(
                (r) => document.paths[r.path][r.method.toLowerCase()].operationId
            );
            expect(new Set(ids).size).toBe(ids.length);

            const refs = JSON.stringify(document).match(/"\$ref":"[^"]+"/g) || [];
            for (const raw of refs) {
                const pointer = raw.slice(8, -1).replace('#/', '').split('/');
                const target = pointer.reduce((node, part) => node?.[part], document);
                expect([raw, target]).not.toEqual([raw, undefined]);
            }
        }
    });

    it('marks the entity proxy as beta', () => {
        const document = buildOpenApiDocument('2', { proxy: true });
        expect(document.paths['/api/v2/entities/{entityId}/proxy'].post['x-frigg-stability']).toBe('beta');
    });
});
