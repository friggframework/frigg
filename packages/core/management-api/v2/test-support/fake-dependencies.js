const Boom = require('@hapi/boom');

/**
 * In-memory doubles for every Management API v2 dependency. Each use case is
 * a jest.fn() so a test can assert on calls or override one behaviour.
 */
function fakeV2Dependencies(overrides = {}) {
    const user = { getId: () => 'user-1' };
    const notFound = (code) => async () => {
        throw Boom.notFound('not found', { code });
    };
    const fn = (impl) => ({ execute: jest.fn(impl) });

    return {
        user,
        config: { v1: true, proxy: { enable: false } },
        authenticateUser: {
            execute: jest.fn(async (req) => {
                if (!req.headers.authorization) {
                    throw Boom.unauthorized('No valid authentication provided');
                }
                return user;
            }),
        },
        getIntegrationsForUser: fn(async () => [
            { id: 'i1', entities: ['e1'], status: 'ENABLED', config: { type: 'sync' }, userActions: {} },
        ]),
        getPossibleIntegrations: fn(async () => [{ type: 'sync', display: {} }]),
        createIntegrationForUser: fn(async () => ({
            id: 'i2', entities: ['e1'], status: 'ENABLED', config: { type: 'sync' },
        })),
        getIntegrationInstanceForUser: fn(async (id) => {
            if (id !== 'i1') return notFound('INTEGRATION_NOT_FOUND')();
            return { id: 'i1', entities: ['e1'], status: 'ENABLED', config: { type: 'sync' } };
        }),
        updateIntegrationForUser: fn(async (id, _user, config) => ({
            id, entities: ['e1'], status: 'ENABLED', config,
        })),
        removeIntegrationForUser: fn(async () => undefined),
        sendIntegrationEventForUser: fn(async (_id, _user, event, payload) => ({ event, payload })),
        runIntegrationActionForUser: fn(async (_id, _user, actionId, payload) => ({ ran: actionId, payload })),
        testIntegrationAuthForUser: fn(async () => ({ ok: true, errors: [] })),

        listEntitiesForUser: fn(async () => [
            { id: 'e1', userId: 'user-1', moduleName: 'acme', name: 'Acme', externalId: 'x1', credential: { id: 'c1', authIsValid: true, access_token: 'secret' } },
        ]),
        getEntityForUser: fn(async (id) => {
            if (id !== 'e1') return notFound('ENTITY_NOT_FOUND')();
            return { id: 'e1', userId: 'user-1', moduleName: 'acme', name: 'Acme', externalId: 'x1', credential: { id: 'c1', authIsValid: true, access_token: 'secret' } };
        }),
        deleteEntityForUser: fn(async () => undefined),
        testEntityAuthForUser: fn(async () => true),
        getEntityOptionsForUser: fn(async () => ({ jsonSchema: {} })),
        refreshEntityOptionsForUser: fn(async (_id, _user, body) => ({ refreshed: body })),
        listEntityTypes: fn(async () => [{ type: 'acme', name: 'Acme' }]),
        getEntityType: fn(async (type) => {
            if (type !== 'acme') return notFound('ENTITY_TYPE_NOT_FOUND')();
            return { type: 'acme', name: 'Acme' };
        }),
        getAuthorizationRequirements: fn(async ({ step }) => ({
            type: 'oauth2', data: { url: 'https://provider.example/authorize' }, step, totalSteps: 1, isMultiStep: false,
        })),
        listCredentialsForUser: fn(async () => [
            { id: 'c1', userId: 'user-1', type: 'acme', entityIds: ['e1'], authIsValid: true, access_token: 'ya29.secret-token-value-1234' },
        ]),
        getCredentialForUser: fn(async (id) => {
            if (id !== 'c1') return notFound('CREDENTIAL_NOT_FOUND')();
            return { id: 'c1', userId: 'user-1', type: 'acme', entityIds: ['e1'], authIsValid: true, api_key: 'sk_live_abcdefghijkl9876' };
        }),
        deleteCredentialForUser: fn(async () => ({ id: 'c1', entityIds: ['e1'] })),
        getAuthorizationStep: fn(async ({ entityType, step }) => {
            if (entityType === 'nope') return notFound('ENTITY_TYPE_NOT_FOUND')();
            return { type: 'email', data: {}, step, totalSteps: 2, isMultiStep: true, sessionId: 'sess-1' };
        }),
        submitAuthorizationStep: fn(async ({ step }) =>
            step === 1
                ? { status: 'pending', step: 2, totalSteps: 2, sessionId: 'sess-1', requirements: { type: 'otp' } }
                : {
                      status: 'complete',
                      entity: { id: 'e1', userId: 'user-1', moduleName: 'acme', credential: { id: 'c1', authIsValid: true } },
                      credential: { id: 'c1', userId: 'user-1', type: 'acme', entityIds: ['e1'], authIsValid: true, access_token: 'ya29.brand-new-token-0001' },
                  }
        ),
        getCredentialReauthorization: fn(async (id, _user, { step }) => ({ type: 'oauth2', data: {}, step, totalSteps: 1 })),
        reauthorizeCredentialForUser: fn(async () => ({
            status: 'complete',
            entity: { id: 'e1', userId: 'user-1', moduleName: 'acme' },
            credential: { id: 'c2', userId: 'user-1', type: 'acme', entityIds: ['e1'], authIsValid: true },
            previousCredentialId: 'c1',
        })),
        executeEntityProxyRequest: fn(async (entityId, _user, request) => {
            if (request?.path === '/limited') {
                throw Boom.tooManyRequests('The upstream API is rate limiting this account', {
                    code: 'RATE_LIMITED', proxy: true, expose: true, retryAfter: '30', details: { upstreamStatus: 429 },
                });
            }
            return { status: 201, body: { success: true, status: 201, headers: {}, data: { id: 'new' } } };
        }),
        ...overrides,
    };
}

module.exports = { fakeV2Dependencies };
