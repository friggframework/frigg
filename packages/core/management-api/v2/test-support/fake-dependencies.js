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
        ...overrides,
    };
}

module.exports = { fakeV2Dependencies };
