/**
 * OpenAPI components for the Management API documents. The shapes match what
 * the v2 handlers return (management-api/v2/dto.js) and are reconciled with
 * packages/schemas/schemas/api-*.schema.json (a test checks the two agree).
 */

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });

const nullable = (schema) => ({ ...schema, nullable: true });

// Whose a record is and what the caller may do with it (ADR-056 §3.4). Added to
// entities, credentials and integrations by the list and get use cases.
const tenancyProperties = {
    scope: { type: 'string', enum: ['individual', 'organization'], description: 'Whose it is. `global` records are not shown to tenants.' },
    owner: {
        type: 'object',
        properties: { type: { type: 'string', enum: ['individual', 'organization'] }, id: { type: 'string' } },
        description: "The user that owns it: the person, or the organization's user",
    },
    organizationId: nullable({
        type: 'string',
        description:
            'The organization it belongs to. Null for an individual entity connected outside an organization, or under ownership.individualAcross "all".',
    }),
    access: {
        type: 'string',
        enum: ['manage', 'use', 'view'],
        description: 'manage (create, reauthorize, delete), use (bind it, proxy through it) or view (metadata only)',
    },
};

const errorBody = {
    type: 'object',
    required: ['error'],
    properties: {
        error: {
            type: 'object',
            required: ['code', 'message'],
            properties: {
                code: {
                    type: 'string',
                    description:
                        'Machine-readable code, e.g. VALIDATION_ERROR, NOT_FOUND, ENTITY_NOT_FOUND, AUTHORIZATION_SESSION_NOT_FOUND, PROXY_NOT_ALLOWED. New codes may be added.',
                },
                message: { type: 'string' },
                details: { description: 'Optional structured details' },
            },
        },
    },
};

const authorizationRequirements = {
    type: 'object',
    required: ['type', 'data', 'step', 'totalSteps', 'isMultiStep'],
    properties: {
        type: {
            type: 'string',
            description: 'oauth2, api-key, basic, form, or a module-specific step type (e.g. email, otp)',
        },
        data: {
            type: 'object',
            description:
                'Step data: { url } for OAuth2, { jsonSchema, uiSchema } for forms',
            additionalProperties: true,
        },
        step: { type: 'integer', minimum: 1 },
        totalSteps: { type: 'integer', minimum: 1 },
        isMultiStep: { type: 'boolean' },
        sessionId: {
            type: 'string',
            description: 'Present for multi-step flows; send it with every later step',
        },
    },
};

const SCHEMAS = {
    Error: errorBody,

    Integration: {
        type: 'object',
        required: ['id', 'entities', 'status', 'config'],
        properties: {
            id: { type: 'string' },
            entities: {
                type: 'array',
                items: {},
                description: 'Entity ids (or entity summaries) the integration connects',
            },
            status: nullable({ type: 'string', description: 'e.g. ENABLED, DISABLED, ERROR, NEEDS_CONFIG' }),
            config: { type: 'object', additionalProperties: true },
            version: nullable({ type: 'string' }),
            messages: { type: 'object', additionalProperties: true },
            ...tenancyProperties,
        },
    },
    ListIntegrationsResponse: {
        type: 'object',
        required: ['integrations'],
        properties: { integrations: { type: 'array', items: ref('Integration') } },
    },
    ListIntegrationOptionsResponse: {
        type: 'object',
        required: ['integrations'],
        properties: {
            integrations: {
                type: 'array',
                items: { type: 'object', additionalProperties: true },
                description: 'Integration types this app offers (each integration Definition option details)',
            },
        },
    },
    CreateIntegrationRequest: {
        type: 'object',
        required: ['entities', 'config'],
        properties: {
            entities: {
                type: 'array',
                items: { type: 'string' },
                description: 'Ids of entities the caller owns',
            },
            config: {
                type: 'object',
                required: ['type'],
                properties: { type: { type: 'string', description: 'Integration name' } },
                additionalProperties: true,
            },
        },
    },
    UpdateIntegrationRequest: {
        type: 'object',
        required: ['config'],
        properties: { config: { type: 'object', additionalProperties: true } },
    },
    AuthTestResult: {
        type: 'object',
        required: ['status'],
        properties: {
            status: { type: 'string', enum: ['ok', 'failed'] },
            errors: { type: 'array', items: { type: 'object', additionalProperties: true } },
        },
    },

    Entity: {
        type: 'object',
        required: ['id', 'type', 'userId'],
        properties: {
            id: { type: 'string' },
            type: nullable({ type: 'string', description: 'Module name' }),
            name: nullable({ type: 'string' }),
            externalId: nullable({ type: 'string' }),
            credentialId: nullable({ type: 'string' }),
            userId: nullable({ type: 'string' }),
            authIsValid: nullable({ type: 'boolean' }),
            ...tenancyProperties,
        },
    },
    ListEntitiesResponse: {
        type: 'object',
        required: ['entities'],
        properties: { entities: { type: 'array', items: ref('Entity') } },
    },
    EntityType: {
        type: 'object',
        required: ['type', 'name', 'authType', 'isMultiStep', 'stepCount', 'usedBy'],
        properties: {
            type: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
            usedBy: {
                type: 'array',
                items: { type: 'string' },
                description:
                    'Names of the integrations that bind this entity type. Empty for a type registered only in appDefinition.entities.',
            },
            authType: { type: 'string', description: 'oauth2, oauth1, api-key, basic or custom' },
            isMultiStep: { type: 'boolean' },
            stepCount: { type: 'integer', minimum: 1 },
            capabilities: {},
            scope: {
                type: 'object',
                description:
                    'The scope a new connection of this type gets and the scopes a request may choose (ADR-056 §3.1). `global` is never offered.',
                properties: {
                    default: { type: 'string', enum: ['individual', 'organization', 'global'] },
                    allow: { type: 'array', items: { type: 'string', enum: ['individual', 'organization'] } },
                    source: { type: 'string', enum: ['binding', 'integration', 'entityType', 'app', 'default'] },
                },
            },
        },
    },
    ListEntityTypesResponse: {
        type: 'object',
        required: ['types'],
        properties: { types: { type: 'array', items: ref('EntityType') } },
    },

    Credential: {
        type: 'object',
        required: ['id', 'type', 'userId', 'authIsValid'],
        description: 'Every provider field in data is masked; values never leave the server.',
        properties: {
            id: { type: 'string' },
            type: nullable({ type: 'string', description: 'Module name, from the entities using it' }),
            externalId: nullable({ type: 'string' }),
            userId: nullable({ type: 'string' }),
            authIsValid: nullable({ type: 'boolean' }),
            entityIds: { type: 'array', items: { type: 'string' } },
            entityCount: { type: 'integer', minimum: 0 },
            createdAt: nullable({ type: 'string', format: 'date-time' }),
            updatedAt: nullable({ type: 'string', format: 'date-time' }),
            data: {
                type: 'object',
                additionalProperties: true,
                description: 'Masked provider fields, e.g. { "access_token": "****WXYZ" }',
            },
        },
    },
    ListCredentialsResponse: {
        type: 'object',
        required: ['credentials'],
        properties: { credentials: { type: 'array', items: ref('Credential') } },
    },

    AuthorizationRequirements: authorizationRequirements,
    AuthorizeRequest: {
        type: 'object',
        required: ['entityType', 'data'],
        properties: {
            entityType: { type: 'string', description: 'Module name' },
            data: { type: 'object', additionalProperties: true, description: 'OAuth callback params or step form data' },
            step: { type: 'integer', minimum: 1, default: 1 },
            sessionId: { type: 'string', description: 'Required for step 2 and later' },
            scope: {
                type: 'string',
                enum: ['individual', 'organization'],
                description:
                    "The scope to connect at, from the entity type's allow list (ADR-056 §3.1). Omit to take the type's default. `global` is refused (403).",
            },
        },
    },
    ReauthorizeRequest: {
        type: 'object',
        required: ['data'],
        properties: {
            data: { type: 'object', additionalProperties: true },
            step: { type: 'integer', minimum: 1, default: 1 },
            sessionId: { type: 'string' },
        },
    },
    AuthorizeComplete: {
        type: 'object',
        required: ['status', 'entity', 'credential'],
        properties: {
            status: { type: 'string', enum: ['complete'] },
            entity: ref('Entity'),
            credential: ref('Credential'),
            previousCredentialId: {
                type: 'string',
                description: 'Re-authorization only: the credential being renewed, when the provider account changed and a new credential was stored',
            },
        },
    },
    AuthorizePending: {
        type: 'object',
        required: ['status', 'step', 'totalSteps', 'sessionId', 'requirements'],
        properties: {
            status: { type: 'string', enum: ['pending'] },
            step: { type: 'integer', minimum: 2 },
            totalSteps: { type: 'integer', minimum: 2 },
            sessionId: { type: 'string' },
            requirements: ref('AuthorizationRequirements'),
            message: { type: 'string', description: 'e.g. "Code sent to your email"' },
        },
    },
    AuthorizeResponse: {
        oneOf: [ref('AuthorizeComplete'), ref('AuthorizePending')],
        discriminator: { propertyName: 'status' },
    },

    ProxyRequest: {
        type: 'object',
        required: ['method', 'path'],
        properties: {
            method: { type: 'string', enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] },
            path: {
                type: 'string',
                pattern: '^/',
                description:
                    "Path relative to the module's base URL. No //, backslashes, ? or #, dot segments, encoded separators or double encoding. The host always comes from the module.",
            },
            query: {
                type: 'object',
                additionalProperties: {
                    oneOf: [
                        { type: 'string' },
                        { type: 'number' },
                        { type: 'boolean' },
                        { type: 'array', items: { type: 'string' } },
                    ],
                },
                description: 'Array values are sent comma-separated',
            },
            headers: {
                type: 'object',
                additionalProperties: { type: 'string' },
                description:
                    'Only accept, content-type, accept-language, if-match, if-none-match and module-listed headers are forwarded. Credential, Host and forwarding headers are refused.',
            },
            body: { description: 'JSON value or string; POST, PUT, PATCH and DELETE only' },
        },
    },
    ProxyResponse: {
        type: 'object',
        required: ['success', 'status', 'headers', 'data'],
        properties: {
            success: { type: 'boolean', description: 'False for relayed upstream 4xx' },
            status: { type: 'integer', description: 'Upstream status; also the HTTP status of this response' },
            headers: { type: 'object', additionalProperties: { type: 'string' } },
            data: { description: 'Parsed JSON, text, or base64 when dataEncoding is set' },
            dataEncoding: { type: 'string', enum: ['base64'] },
        },
    },
    ProxyError: {
        type: 'object',
        required: ['success', 'status', 'error'],
        properties: {
            success: { type: 'boolean', enum: [false] },
            status: { type: 'integer' },
            error: errorBody.properties.error,
        },
    },

    ApiMeta: {
        type: 'object',
        required: ['api', 'capabilities'],
        properties: {
            api: {
                type: 'object',
                required: ['versions', 'preferred'],
                properties: {
                    versions: {
                        type: 'object',
                        additionalProperties: {
                            type: 'object',
                            required: ['status', 'openapi'],
                            properties: {
                                status: { type: 'string', enum: ['stable', 'beta', 'deprecated', 'disabled'] },
                                deprecatedAt: { type: 'string', format: 'date' },
                                sunset: nullable({ type: 'string', format: 'date' }),
                                openapi: { type: 'string' },
                            },
                        },
                    },
                    preferred: { type: 'string' },
                },
            },
            capabilities: {
                type: 'array',
                items: { type: 'string' },
                description: 'Stable feature flags, e.g. credentials, multiStepAuthorize, entityProxy',
            },
            frigg: {
                type: 'object',
                description: 'Only for callers with x-frigg-admin-api-key',
                properties: { coreVersion: { type: 'string' } },
            },
        },
    },
};

const errorResponse = (description) => ({
    description,
    content: { 'application/json': { schema: ref('Error') } },
});

const RESPONSES = {
    BadRequest: errorResponse('Invalid request (VALIDATION_ERROR, INVALID_JSON, INVALID_STEP, ...)'),
    Unauthorized: errorResponse('Missing or invalid authentication'),
    Forbidden: errorResponse('Not allowed'),
    NotFound: errorResponse('Not found, or not owned by the caller'),
    Conflict: errorResponse('Conflicts with the current state'),
    Gone: errorResponse('This API version is disabled for the app'),
    BadGateway: errorResponse('The provider failed'),
};

const SECURITY_SCHEMES = {
    bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        description: 'Frigg user token (POST /user/login) or, when enabled, an adopter JWT',
    },
    friggApiKey: {
        type: 'apiKey',
        in: 'header',
        name: 'x-frigg-api-key',
        description:
            'Backend-to-backend shared secret. Send x-frigg-appuserid (and x-frigg-apporgid for organisation users) to act for a user.',
    },
    adminApiKey: {
        type: 'apiKey',
        in: 'header',
        name: 'x-frigg-admin-api-key',
        description: 'Admin key; on /api/meta it only adds the core version',
    },
};

module.exports = { SCHEMAS, RESPONSES, SECURITY_SCHEMES, ref };
