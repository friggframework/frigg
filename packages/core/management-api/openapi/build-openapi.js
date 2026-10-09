const {
    MANAGEMENT_API_VERSIONS,
    V1_ROUTES,
    META_ROUTES,
    V1_MIGRATION_DOCS_URL,
    listV2Routes,
    toGatewayPath,
} = require('../route-registry');
const { SCHEMAS, RESPONSES, SECURITY_SCHEMES } = require('./components');
const { V2_OPERATIONS, META_OPERATIONS } = require('./v2-operations');
const { V1_OPERATIONS } = require('./v1-operations');
const { version: coreVersion } = require('../../package.json');

const COMPATIBILITY_RULES = `
Compatibility (ADR-053): within a major, changes are additive only. Clients
must ignore response fields and enum values they do not know. Operations
marked \`x-frigg-stability: beta\` may still change in a core minor.

Errors: \`{ "error": { "code", "message", "details"? } }\`. Every response
carries \`Frigg-API-Version: 2\`.`;

const DESCRIPTIONS = {
    1: `The original, unprefixed Management API. Deprecated (ADR-053): every response carries
\`Deprecation\` and \`Link: <${V1_MIGRATION_DOCS_URL}>; rel="deprecation"\`. It is frozen,
and \`managementApi.v1: false\` turns it off. Use v2.`,
    2: `Integrations, entities, credentials, multi-step authorization and the entity proxy, under
\`/api/v2\`. Discover what a deployment serves with \`GET /api/meta\`.
${COMPATIBILITY_RULES}`,
};

const TAGS = [
    { name: 'Integrations', description: 'Integrations between connected entities' },
    { name: 'Entities', description: 'Connected accounts, entity types and the entity proxy' },
    { name: 'Credentials', description: 'Stored credentials (always masked) and re-authorization' },
    { name: 'Authorization', description: 'Single- and multi-step authorization' },
    { name: 'Meta', description: 'Version-neutral discovery' },
];

/** Path parameters, derived from the Express path. */
function pathParameters(expressPath) {
    return [...expressPath.matchAll(/:([A-Za-z0-9_]+)/g)].map(([, name]) => ({
        name,
        in: 'path',
        required: true,
        schema: { type: 'string' },
    }));
}

function operationFor(route, docs, extra = {}) {
    if (!docs) {
        throw new Error(
            `No OpenAPI documentation for ${route.method} ${route.path} (${route.operationId || 'v1'})`
        );
    }
    const parameters = [...pathParameters(route.path), ...(docs.parameters || [])];
    return {
        operationId: route.operationId,
        ...(route.tag && { tags: [route.tag] }),
        ...docs,
        ...(parameters.length && { parameters }),
        ...(route.stability && { 'x-frigg-stability': route.stability }),
        ...extra,
    };
}

function addOperation(paths, route, operation) {
    const path = toGatewayPath(route.path);
    paths[path] = paths[path] || {};
    // An ANY route (router.all in v1) is documented as GET and POST, the two
    // methods callers use.
    const methods = route.method === 'ANY' ? ['get', 'post'] : [route.method.toLowerCase()];
    for (const method of methods) {
        paths[path][method] = {
            ...operation,
            ...(methods.length > 1 && {
                operationId: `${operation.operationId}${method === 'get' ? '' : 'Post'}`,
            }),
        };
    }
}

/**
 * Builds the OpenAPI 3 document for one Management API major from the route
 * registry (ADR-053 §5).
 *
 * @param {string} major - '1' or '2'
 * @param {Object} [options]
 * @param {boolean} [options.proxy=true] - include the entity proxy (served
 *   documents follow managementApi.proxy.enable)
 * @returns {Object}
 */
function buildOpenApiDocument(major, { proxy = true } = {}) {
    const info = MANAGEMENT_API_VERSIONS[major];
    if (!info) throw new Error(`Unknown Management API version: ${major}`);

    const paths = {};
    if (major === '1') {
        for (const route of V1_ROUTES) {
            const key = `${route.method} ${route.path}`;
            addOperation(
                paths,
                route,
                operationFor({ ...route, operationId: V1_OPERATIONS[key]?.operationId }, V1_OPERATIONS[key], {
                    deprecated: true,
                })
            );
        }
    } else {
        for (const route of listV2Routes({ proxy })) {
            addOperation(paths, route, operationFor(route, V2_OPERATIONS[route.operationId]));
        }
    }
    for (const route of META_ROUTES) {
        addOperation(
            paths,
            route,
            operationFor({ ...route, tag: 'Meta' }, META_OPERATIONS[route.operationId])
        );
    }

    return {
        openapi: '3.0.3',
        info: {
            title: `Frigg Management API v${major}`,
            version: coreVersion,
            description: DESCRIPTIONS[major],
            license: { name: 'MIT' },
        },
        'x-frigg-api-version': major,
        'x-frigg-api-status': info.status,
        ...(info.deprecatedAt && { 'x-frigg-deprecated-at': info.deprecatedAt }),
        servers: [{ url: '/', description: 'This Frigg deployment' }],
        security: [{ bearerAuth: [] }, { friggApiKey: [] }],
        tags: TAGS,
        paths,
        components: {
            schemas: SCHEMAS,
            responses: RESPONSES,
            securitySchemes: SECURITY_SCHEMES,
        },
    };
}

module.exports = { buildOpenApiDocument };
