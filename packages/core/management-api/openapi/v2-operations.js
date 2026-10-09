const { ref } = require('./components');

/**
 * Per-operation documentation for Management API v2, keyed by the route
 * registry's operationId. Paths and methods come from the registry, never
 * from here, so the document cannot list a route the router does not serve.
 */

const json = (schema) => ({ content: { 'application/json': { schema } } });
const ok = (description, schema) => ({ description, ...(schema && json(schema)) });
const body = (schema, required = true) => ({ required, ...json(schema) });
const errors = (...names) =>
    Object.fromEntries(
        names.map((name) => {
            const status = {
                BadRequest: '400',
                Unauthorized: '401',
                Forbidden: '403',
                NotFound: '404',
                Conflict: '409',
                BadGateway: '502',
            }[name];
            return [status, { $ref: `#/components/responses/${name}` }];
        })
    );
const query = (name, description, schema = { type: 'string' }, required = false) => ({
    name,
    in: 'query',
    required,
    description,
    schema,
});
const stepQuery = [
    query('step', 'Step number, 1-based (default 1)', { type: 'integer', minimum: 1 }),
    query('sessionId', 'Session from step 1; required for later steps'),
];
const anyJson = { description: 'Defined by the integration or module' };

const V2_OPERATIONS = {
    // Integrations
    listIntegrations: {
        summary: "List the caller's integrations",
        description:
            'Returns only `{ integrations }`. Integration types are at /api/v2/integrations/options and connected accounts at /api/v2/entities.',
        responses: { 200: ok('Integrations', ref('ListIntegrationsResponse')), ...errors('Unauthorized') },
    },
    listIntegrationOptions: {
        summary: 'List the integration types this app offers',
        responses: { 200: ok('Integration types', ref('ListIntegrationOptionsResponse')), ...errors('Unauthorized') },
    },
    createIntegration: {
        summary: 'Create an integration between entities the caller owns',
        description: 'An identical existing integration (same user, type and entities) is reused.',
        requestBody: body(ref('CreateIntegrationRequest')),
        responses: {
            201: ok('Created (or reused) integration', ref('Integration')),
            ...errors('BadRequest', 'Unauthorized', 'NotFound'),
        },
    },
    getIntegration: {
        summary: 'Get an integration',
        responses: { 200: ok('Integration', ref('Integration')), ...errors('Unauthorized', 'NotFound') },
    },
    updateIntegration: {
        summary: "Replace an integration's config",
        requestBody: body(ref('UpdateIntegrationRequest')),
        responses: { 200: ok('Updated integration', ref('Integration')), ...errors('BadRequest', 'Unauthorized', 'NotFound') },
    },
    deleteIntegration: {
        summary: 'Delete an integration',
        responses: { 204: { description: 'Deleted' }, ...errors('Unauthorized', 'NotFound') },
    },
    getIntegrationConfigOptions: {
        summary: 'Get config options (form schema) for an integration',
        responses: { 200: ok('Options', anyJson), ...errors('Unauthorized', 'NotFound') },
    },
    refreshIntegrationConfigOptions: {
        summary: 'Refresh config options with the current form values',
        requestBody: body({ type: 'object', additionalProperties: true }, false),
        responses: { 200: ok('Options', anyJson), ...errors('BadRequest', 'Unauthorized', 'NotFound') },
    },
    listIntegrationActions: {
        summary: 'List user actions an integration offers',
        parameters: [query('actionType', 'Only actions of this userActionType')],
        responses: { 200: ok('User actions', anyJson), ...errors('Unauthorized', 'NotFound') },
    },
    getIntegrationActionOptions: {
        summary: 'Get the options form for a user action',
        requestBody: body({ type: 'object', additionalProperties: true }, false),
        responses: { 200: ok('Options', anyJson), ...errors('Unauthorized', 'NotFound') },
    },
    refreshIntegrationActionOptions: {
        summary: 'Refresh a user action options form',
        requestBody: body({ type: 'object', additionalProperties: true }, false),
        responses: { 200: ok('Options', anyJson), ...errors('Unauthorized', 'NotFound') },
    },
    runIntegrationAction: {
        summary: 'Run a user action',
        description: 'Only actions the integration lists as user actions can run; anything else is 404 ACTION_NOT_FOUND.',
        requestBody: body({ type: 'object', additionalProperties: true }, false),
        responses: { 200: ok('Action result', anyJson), ...errors('BadRequest', 'Unauthorized', 'NotFound') },
    },
    testIntegrationAuth: {
        summary: "Test an integration's connections",
        responses: { 200: ok('Result', ref('AuthTestResult')), ...errors('Unauthorized', 'NotFound') },
    },

    // Entities
    listEntities: {
        summary: "List the caller's connected entities",
        responses: { 200: ok('Entities', ref('ListEntitiesResponse')), ...errors('Unauthorized') },
    },
    listEntityTypes: {
        summary: 'List the entity types (API modules) this app can connect',
        responses: { 200: ok('Entity types', ref('ListEntityTypesResponse')), ...errors('Unauthorized') },
    },
    getEntityType: {
        summary: 'Describe an entity type',
        responses: { 200: ok('Entity type', ref('EntityType')), ...errors('Unauthorized', 'NotFound') },
    },
    getEntityTypeRequirements: {
        summary: 'Describe one authorization step of an entity type',
        description: 'Read-only: does not start a session. Use GET /api/v2/authorize to start a flow.',
        parameters: [stepQuery[0]],
        responses: {
            200: ok('Requirements', ref('AuthorizationRequirements')),
            ...errors('BadRequest', 'Unauthorized', 'NotFound'),
        },
    },
    getEntity: {
        summary: 'Get an entity',
        responses: { 200: ok('Entity', ref('Entity')), ...errors('Unauthorized', 'NotFound') },
    },
    deleteEntity: {
        summary: 'Delete an entity',
        description: 'Refused with 409 ENTITY_IN_USE while integrations use it. The credential stays.',
        responses: { 204: { description: 'Deleted' }, ...errors('Unauthorized', 'NotFound', 'Conflict') },
    },
    testEntityAuth: {
        summary: "Test an entity's stored credential",
        responses: { 200: ok('Result', ref('AuthTestResult')), ...errors('Unauthorized', 'NotFound') },
    },
    getEntityOptions: {
        summary: "Get an entity's options",
        responses: { 200: ok('Options', anyJson), ...errors('Unauthorized', 'NotFound') },
    },
    refreshEntityOptions: {
        summary: "Refresh an entity's options",
        requestBody: body({ type: 'object', additionalProperties: true }, false),
        responses: { 200: ok('Options', anyJson), ...errors('Unauthorized', 'NotFound') },
    },
    proxyEntityRequest: {
        summary: "Call the entity's API through Frigg (beta)",
        description:
            "ADR-052. Off unless the app sets managementApi.proxy.enable. Path-only input relative to the module's base URL; deny by default, only operations in the module's (or the app's) allow-list. The HTTP status follows the upstream status; upstream 5xx is 502 UPSTREAM_ERROR, 429 keeps Retry-After.",
        requestBody: body(ref('ProxyRequest')),
        responses: {
            200: ok('Upstream answer (the status mirrors the upstream status)', ref('ProxyResponse')),
            400: ok('INVALID_PROXY_REQUEST', ref('ProxyError')),
            401: ok('INVALID_CREDENTIALS or unauthenticated', ref('ProxyError')),
            403: ok('PROXY_NOT_ALLOWED', ref('ProxyError')),
            404: ok('Entity not found', ref('Error')),
            413: ok('PAYLOAD_TOO_LARGE', ref('ProxyError')),
            415: ok('UNSUPPORTED_MEDIA_TYPE', ref('ProxyError')),
            429: ok('RATE_LIMITED (Retry-After passed through)', ref('ProxyError')),
            502: ok('UPSTREAM_ERROR, NETWORK_ERROR or RESPONSE_TOO_LARGE', ref('ProxyError')),
            504: ok('TIMEOUT', ref('ProxyError')),
        },
    },

    // Credentials
    listCredentials: {
        summary: "List the caller's credentials (masked)",
        responses: { 200: ok('Credentials', ref('ListCredentialsResponse')), ...errors('Unauthorized') },
    },
    getCredential: {
        summary: 'Get a credential (masked)',
        responses: { 200: ok('Credential', ref('Credential')), ...errors('Unauthorized', 'NotFound') },
    },
    deleteCredential: {
        summary: 'Delete a credential',
        description: 'Entities that used it stay, with no credential, until re-authorized.',
        responses: { 204: { description: 'Deleted' }, ...errors('Unauthorized', 'NotFound') },
    },
    getCredentialReauthorizeRequirements: {
        summary: 'Start or continue re-authorizing a credential',
        parameters: stepQuery,
        responses: {
            200: ok('Requirements', ref('AuthorizationRequirements')),
            ...errors('BadRequest', 'Unauthorized', 'NotFound', 'Conflict'),
        },
    },
    reauthorizeCredential: {
        summary: 'Submit a re-authorization step',
        requestBody: body(ref('ReauthorizeRequest')),
        responses: {
            200: ok('Complete or pending', ref('AuthorizeResponse')),
            ...errors('BadRequest', 'Unauthorized', 'NotFound', 'Conflict', 'BadGateway'),
        },
    },

    // Authorization
    getAuthorizationRequirements: {
        summary: 'Start or continue an authorization',
        description:
            'Single-step modules return their requirements. Multi-step modules start a session on step 1 (returned as sessionId); later steps need it and must be the current step.',
        parameters: [
            query('entityType', 'Module name', { type: 'string' }, true),
            ...stepQuery,
            query('state', 'OAuth state forwarded to the provider'),
        ],
        responses: {
            200: ok('Requirements', ref('AuthorizationRequirements')),
            ...errors('BadRequest', 'Unauthorized', 'NotFound', 'Conflict'),
        },
    },
    authorize: {
        summary: 'Submit an authorization step',
        description:
            'Answers { status: "complete", entity, credential } or { status: "pending", step, totalSteps, sessionId, requirements }.',
        requestBody: body(ref('AuthorizeRequest')),
        responses: {
            200: ok('Complete or pending', ref('AuthorizeResponse')),
            ...errors('BadRequest', 'Unauthorized', 'NotFound', 'Conflict', 'BadGateway'),
        },
    },
};

const META_OPERATIONS = {
    getApiMeta: {
        summary: 'Supported API versions and capabilities',
        description: 'No authentication, no database. The core version is added for admin callers only.',
        security: [],
        responses: { 200: ok('Discovery document', ref('ApiMeta')) },
    },
    getOpenApiV1: {
        summary: 'OpenAPI document for Management API v1 (deprecated)',
        security: [],
        responses: { 200: ok('OpenAPI 3 document', { type: 'object' }) },
    },
    getOpenApiV2: {
        summary: 'OpenAPI document for Management API v2',
        security: [],
        responses: { 200: ok('OpenAPI 3 document', { type: 'object' }) },
    },
};

module.exports = { V2_OPERATIONS, META_OPERATIONS };
