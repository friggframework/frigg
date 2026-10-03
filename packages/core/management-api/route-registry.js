/**
 * Management API route registry (ADR-053).
 *
 * The single source of truth for the Management API surface. Three consumers
 * read it, so they cannot drift apart:
 *
 * - the Express routers (v2 mounts its handlers by `operationId`; v1 gets its
 *   deprecation headers from the v1 list),
 * - the OpenAPI documents served at /api/meta/openapi/v{n}.json,
 * - the API Gateway HTTP API routes that devtools generates
 *   (`getGatewayRoutes`, used by base-definition-factory).
 *
 * Rules (ADR-053):
 * - v2 lives under `/api/v2/<resource>`. Gateway routes are declared per
 *   resource, never `ANY /api/v2/{proxy+}`: `/api/v2/reports` (ADR-010) is
 *   served by the admin-scripts Lambda and must not be shadowed.
 * - v1 is the frozen unprefixed surface. Its handlers live in
 *   integrations/integration-router.js and do not change; this list mirrors
 *   them (a contract test keeps the two equal).
 * - `/api/meta` is version-neutral and served by the DB-free `health` Lambda.
 *
 * This module must stay free of database, AWS and app-definition imports:
 * devtools loads it at build time.
 */

/**
 * Supported Management API majors. `deprecatedAt` feeds the RFC 9745
 * `Deprecation` header; `sunset` (RFC 8594) stays null until a removal release
 * is scheduled.
 */
const MANAGEMENT_API_VERSIONS = Object.freeze({
    1: Object.freeze({
        status: 'deprecated',
        deprecatedAt: '2026-11-01',
        sunset: null,
    }),
    2: Object.freeze({ status: 'stable' }),
});

const PREFERRED_API_VERSION = '2';

/**
 * `/api/v2/<segment>` values no v2 route may take. `reports` belongs to the
 * admin-scripts Lambda (ADR-010); where it lives long term is open (ADR-053
 * §7), so it is reserved, kept out of the v2 OpenAPI document and out of the
 * /api/meta capabilities.
 */
const RESERVED_V2_SEGMENTS = Object.freeze(['reports']);

const V1_MIGRATION_DOCS_URL =
    'https://docs.friggframework.org/api/migrate-v1-v2';

/** Lambda functions (devtools names) that serve Management API routes. */
const FUNCTIONS = Object.freeze({ AUTH: 'auth', HEALTH: 'health' });

const route = (version, fn) => (definition) =>
    Object.freeze({ version, function: fn, ...definition });

/**
 * The v1 routes registered by createIntegrationRouter(). `ANY` marks routes
 * registered with `router.all()`. Frozen: no behaviour change except the
 * deprecation headers.
 */
const V1_ROUTES = Object.freeze(
    [
        { method: 'GET', path: '/api/integrations' },
        { method: 'POST', path: '/api/integrations' },
        { method: 'PATCH', path: '/api/integrations/:integrationId' },
        { method: 'DELETE', path: '/api/integrations/:integrationId' },
        {
            method: 'GET',
            path: '/api/integrations/:integrationId/config/options',
        },
        {
            method: 'POST',
            path: '/api/integrations/:integrationId/config/options/refresh',
        },
        { method: 'ANY', path: '/api/integrations/:integrationId/actions' },
        {
            method: 'ANY',
            path: '/api/integrations/:integrationId/actions/:actionId/options',
        },
        {
            method: 'POST',
            path: '/api/integrations/:integrationId/actions/:actionId/options/refresh',
        },
        {
            method: 'POST',
            path: '/api/integrations/:integrationId/actions/:actionId',
        },
        { method: 'GET', path: '/api/integrations/:integrationId' },
        { method: 'GET', path: '/api/integrations/:integrationId/test-auth' },
        { method: 'GET', path: '/api/authorize' },
        { method: 'POST', path: '/api/authorize' },
        { method: 'POST', path: '/api/entity' },
        { method: 'GET', path: '/api/entity/options/:credentialId' },
        { method: 'GET', path: '/api/entities/:entityId/test-auth' },
        { method: 'GET', path: '/api/entities/:entityId' },
        { method: 'POST', path: '/api/entities/:entityId/options' },
        { method: 'POST', path: '/api/entities/:entityId/options/refresh' },
    ].map(route('1', FUNCTIONS.AUTH))
);

/**
 * The v2 routes. Order matters: Express matches in this order, so literal
 * segments (`/options`, `/types`) come before `/:id` siblings.
 *
 * - `operationId` keys the handler in management-api/v2 and the OpenAPI
 *   operation.
 * - `stability: 'beta'` marks routes that may still change in a core minor
 *   (ADR-053 §2); it is published as `x-frigg-stability`.
 * - `capability` names the /api/meta capability a route belongs to.
 */
const V2_ROUTES = Object.freeze(
    [
        // Integrations
        { operationId: 'listIntegrations', method: 'GET', path: '/api/v2/integrations', tag: 'Integrations' },
        { operationId: 'listIntegrationOptions', method: 'GET', path: '/api/v2/integrations/options', tag: 'Integrations' },
        { operationId: 'createIntegration', method: 'POST', path: '/api/v2/integrations', tag: 'Integrations' },
        { operationId: 'getIntegration', method: 'GET', path: '/api/v2/integrations/:integrationId', tag: 'Integrations' },
        { operationId: 'updateIntegration', method: 'PATCH', path: '/api/v2/integrations/:integrationId', tag: 'Integrations' },
        { operationId: 'deleteIntegration', method: 'DELETE', path: '/api/v2/integrations/:integrationId', tag: 'Integrations' },
        { operationId: 'getIntegrationConfigOptions', method: 'GET', path: '/api/v2/integrations/:integrationId/config/options', tag: 'Integrations' },
        { operationId: 'refreshIntegrationConfigOptions', method: 'POST', path: '/api/v2/integrations/:integrationId/config/options/refresh', tag: 'Integrations' },
        { operationId: 'listIntegrationActions', method: 'GET', path: '/api/v2/integrations/:integrationId/actions', tag: 'Integrations' },
        { operationId: 'getIntegrationActionOptions', method: 'POST', path: '/api/v2/integrations/:integrationId/actions/:actionId/options', tag: 'Integrations' },
        { operationId: 'refreshIntegrationActionOptions', method: 'POST', path: '/api/v2/integrations/:integrationId/actions/:actionId/options/refresh', tag: 'Integrations' },
        { operationId: 'runIntegrationAction', method: 'POST', path: '/api/v2/integrations/:integrationId/actions/:actionId', tag: 'Integrations' },
        { operationId: 'testIntegrationAuth', method: 'GET', path: '/api/v2/integrations/:integrationId/test-auth', tag: 'Integrations' },

        // Entities
        { operationId: 'listEntities', method: 'GET', path: '/api/v2/entities', tag: 'Entities' },
        { operationId: 'listEntityTypes', method: 'GET', path: '/api/v2/entities/types', tag: 'Entities' },
        { operationId: 'getEntityType', method: 'GET', path: '/api/v2/entities/types/:entityType', tag: 'Entities' },
        { operationId: 'getEntityTypeRequirements', method: 'GET', path: '/api/v2/entities/types/:entityType/requirements', tag: 'Entities' },
        { operationId: 'getEntity', method: 'GET', path: '/api/v2/entities/:entityId', tag: 'Entities' },
        { operationId: 'deleteEntity', method: 'DELETE', path: '/api/v2/entities/:entityId', tag: 'Entities' },
        { operationId: 'testEntityAuth', method: 'GET', path: '/api/v2/entities/:entityId/test-auth', tag: 'Entities' },
        { operationId: 'getEntityOptions', method: 'GET', path: '/api/v2/entities/:entityId/options', tag: 'Entities' },
        { operationId: 'refreshEntityOptions', method: 'POST', path: '/api/v2/entities/:entityId/options/refresh', tag: 'Entities' },
        { operationId: 'proxyEntityRequest', method: 'POST', path: '/api/v2/entities/:entityId/proxy', tag: 'Entities', stability: 'beta', capability: 'entityProxy' },

        // Credentials
        { operationId: 'listCredentials', method: 'GET', path: '/api/v2/credentials', tag: 'Credentials', capability: 'credentials' },
        { operationId: 'getCredential', method: 'GET', path: '/api/v2/credentials/:credentialId', tag: 'Credentials', capability: 'credentials' },
        { operationId: 'deleteCredential', method: 'DELETE', path: '/api/v2/credentials/:credentialId', tag: 'Credentials', capability: 'credentials' },
        { operationId: 'getCredentialReauthorizeRequirements', method: 'GET', path: '/api/v2/credentials/:credentialId/reauthorize', tag: 'Credentials', capability: 'credentials' },
        { operationId: 'reauthorizeCredential', method: 'POST', path: '/api/v2/credentials/:credentialId/reauthorize', tag: 'Credentials', capability: 'credentials' },

        // Authorization (multi-step)
        { operationId: 'getAuthorizationRequirements', method: 'GET', path: '/api/v2/authorize', tag: 'Authorization', capability: 'multiStepAuthorize' },
        { operationId: 'authorize', method: 'POST', path: '/api/v2/authorize', tag: 'Authorization', capability: 'multiStepAuthorize' },
    ].map(route('2', FUNCTIONS.AUTH))
);

/** Version-neutral discovery routes, served without auth or database. */
const META_ROUTES = Object.freeze(
    [
        { operationId: 'getApiMeta', method: 'GET', path: '/api/meta' },
        ...Object.keys(MANAGEMENT_API_VERSIONS).map((major) => ({
            operationId: `getOpenApiV${major}`,
            method: 'GET',
            path: `/api/meta/openapi/v${major}.json`,
        })),
    ].map(route(null, FUNCTIONS.HEALTH))
);

/**
 * Unversioned routes the auth Lambda serves next to the Management API
 * (core/handlers/routers/auth.js). The OAuth redirect is the provider's
 * callback target, so it is neither deprecated nor disabled with v1.
 */
const AUTH_EXTRA_ROUTES = Object.freeze(
    [
        {
            operationId: 'oauthRedirect',
            method: 'GET',
            path: '/api/integrations/redirect/:appId',
        },
    ].map(route(null, FUNCTIONS.AUTH))
);

/**
 * The v2 routes an app serves. Routes tied to an opt-in capability (the entity
 * proxy, ADR-052) are left out unless the app enables it.
 *
 * @param {Object} [options]
 * @param {boolean} [options.proxy=false] - `managementApi.proxy.enable`
 */
function listV2Routes({ proxy = false } = {}) {
    return V2_ROUTES.filter(
        (record) => proxy || record.capability !== 'entityProxy'
    );
}

/**
 * @param {Object} [options]
 * @param {boolean} [options.v1=true] - false drops the v1 routes
 *   (`managementApi.v1: false` in the app definition).
 * @param {boolean} [options.proxy=false] - true keeps the entity proxy route.
 * @returns {Array<Object>} Every registered route record.
 */
function listRoutes({ v1 = true, proxy = false } = {}) {
    return [
        ...(v1 ? V1_ROUTES : []),
        ...listV2Routes({ proxy }),
        ...META_ROUTES,
        ...AUTH_EXTRA_ROUTES,
    ];
}

/** `/api/v2/entities/:entityId` -> `/api/v2/entities/{entityId}` */
function toGatewayPath(expressPath) {
    return expressPath.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

/**
 * The resource root a route is grouped under for API Gateway:
 * `/api/v2/<resource>` for v2, `/api/<resource>` for v1, `/api/meta` for meta.
 */
function resourceRoot(record) {
    const segments = record.path.split('/').filter(Boolean);
    const depth = record.version === '2' ? 3 : 2;
    return `/${segments.slice(0, depth).join('/')}`;
}

/**
 * API Gateway HTTP API routes for the Management API, derived from the
 * registry. Each resource root gets an exact route when the root itself is
 * registered and a greedy `{proxy+}` route when deeper paths are. The auth
 * function uses `ANY` (as it always has, so CORS preflights reach Express);
 * the health function only serves GET.
 *
 * @param {Object} [options]
 * @param {boolean} [options.v1=true]
 * @param {boolean} [options.proxy=false]
 * @returns {Array<{function: string, method: string, path: string}>}
 */
function getGatewayRoutes({ v1 = true, proxy = false } = {}) {
    const out = [];
    const seen = new Set();
    const add = (fn, method, path) => {
        const key = `${fn} ${method} ${path}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ function: fn, method, path });
    };

    const grouped = [
        ...(v1 ? V1_ROUTES : []),
        ...listV2Routes({ proxy }),
        ...META_ROUTES,
    ];
    const greedyRoots = new Set();
    for (const record of grouped) {
        const root = resourceRoot(record);
        const method = record.function === FUNCTIONS.AUTH ? 'ANY' : 'GET';
        if (record.path === root) {
            add(record.function, method, root);
        } else {
            add(record.function, method, `${root}/{proxy+}`);
            greedyRoots.add(`${record.function} ${root}`);
        }
    }

    // Extra routes get an exact route unless a greedy route on the same
    // function already covers them.
    for (const record of AUTH_EXTRA_ROUTES) {
        const covered = greedyRoots.has(
            `${record.function} ${resourceRoot(record)}`
        );
        if (!covered) {
            add(record.function, record.method, toGatewayPath(record.path));
        }
    }

    return out;
}

module.exports = {
    MANAGEMENT_API_VERSIONS,
    PREFERRED_API_VERSION,
    RESERVED_V2_SEGMENTS,
    V1_MIGRATION_DOCS_URL,
    FUNCTIONS,
    V1_ROUTES,
    V2_ROUTES,
    META_ROUTES,
    AUTH_EXTRA_ROUTES,
    listRoutes,
    listV2Routes,
    getGatewayRoutes,
    toGatewayPath,
};
