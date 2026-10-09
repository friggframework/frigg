/**
 * Documentation for the frozen Management API v1 routes, keyed by
 * "METHOD path" as in the route registry. Each names its v2 replacement
 * (docs/reference/api-reference.md has the full migration table).
 */

const any = { description: 'Response body as returned by v1' };
const v1 = (operationId, summary, replacement, extra = {}) => ({
    operationId,
    summary,
    description: replacement ? `Deprecated. Use ${replacement}.` : 'Deprecated.',
    responses: { 200: any },
    ...extra,
});

const V1_OPERATIONS = {
    'GET /api/integrations': v1(
        'v1ListIntegrations',
        'List integrations, integration options and authorized entities in one response',
        'GET /api/v2/integrations, GET /api/v2/integrations/options and GET /api/v2/entities'
    ),
    'POST /api/integrations': v1('v1CreateIntegration', 'Create an integration', 'POST /api/v2/integrations', {
        responses: { 201: any },
    }),
    'PATCH /api/integrations/:integrationId': v1('v1UpdateIntegration', 'Update an integration', 'PATCH /api/v2/integrations/{integrationId}'),
    'DELETE /api/integrations/:integrationId': v1('v1DeleteIntegration', 'Delete an integration', 'DELETE /api/v2/integrations/{integrationId}', {
        responses: { 204: any },
    }),
    'GET /api/integrations/:integrationId/config/options': v1(
        'v1GetIntegrationConfigOptions',
        'Get config options',
        'GET /api/v2/integrations/{integrationId}/config/options'
    ),
    'POST /api/integrations/:integrationId/config/options/refresh': v1(
        'v1RefreshIntegrationConfigOptions',
        'Refresh config options',
        'POST /api/v2/integrations/{integrationId}/config/options/refresh'
    ),
    'ANY /api/integrations/:integrationId/actions': v1(
        'v1ListIntegrationActions',
        'List user actions (any method)',
        'GET /api/v2/integrations/{integrationId}/actions'
    ),
    'ANY /api/integrations/:integrationId/actions/:actionId/options': v1(
        'v1GetIntegrationActionOptions',
        'Get user action options (any method)',
        'POST /api/v2/integrations/{integrationId}/actions/{actionId}/options'
    ),
    'POST /api/integrations/:integrationId/actions/:actionId/options/refresh': v1(
        'v1RefreshIntegrationActionOptions',
        'Refresh user action options',
        'POST /api/v2/integrations/{integrationId}/actions/{actionId}/options/refresh'
    ),
    'POST /api/integrations/:integrationId/actions/:actionId': v1(
        'v1RunIntegrationAction',
        'Run an integration event',
        'POST /api/v2/integrations/{integrationId}/actions/{actionId} (user actions only)'
    ),
    'GET /api/integrations/:integrationId': v1('v1GetIntegration', 'Get an integration', 'GET /api/v2/integrations/{integrationId}'),
    'GET /api/integrations/:integrationId/test-auth': v1(
        'v1TestIntegrationAuth',
        'Test integration auth',
        'GET /api/v2/integrations/{integrationId}/test-auth'
    ),
    'GET /api/authorize': v1('v1GetAuthorizeRequirements', 'Get authorization requirements', 'GET /api/v2/authorize'),
    'POST /api/authorize': v1('v1Authorize', 'Authorize an entity', 'POST /api/v2/authorize'),
    'POST /api/entity': v1('v1CreateEntity', 'Create an entity from a credential', 'POST /api/v2/authorize (authorization creates the entity)'),
    'GET /api/entity/options/:credentialId': v1(
        'v1GetEntityOptionsByCredential',
        'Get entity options for a credential',
        'GET /api/v2/entities/{entityId}/options'
    ),
    'GET /api/entities/:entityId/test-auth': v1('v1TestEntityAuth', 'Test entity auth', 'GET /api/v2/entities/{entityId}/test-auth'),
    'GET /api/entities/:entityId': v1('v1GetEntity', 'Get an entity', 'GET /api/v2/entities/{entityId}'),
    'POST /api/entities/:entityId/options': v1('v1GetEntityOptions', 'Get entity options', 'GET /api/v2/entities/{entityId}/options'),
    'POST /api/entities/:entityId/options/refresh': v1(
        'v1RefreshEntityOptions',
        'Refresh entity options',
        'POST /api/v2/entities/{entityId}/options/refresh'
    ),
};

module.exports = { V1_OPERATIONS };
