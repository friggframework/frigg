/**
 * ADR-059 at the v2 API: a type registered in appDefinition.entities is listed,
 * described and authorizable with no integration binding it, and every
 * description carries `usedBy`. Real registry and use cases; repositories and
 * authentication are the only fakes.
 */
jest.mock(
    '../../integrations/repositories/integration-repository-factory',
    () => ({
        createIntegrationRepository: () => ({}),
    })
);
jest.mock(
    '../../credential/repositories/credential-repository-factory',
    () => ({
        createCredentialRepository: () => ({}),
    })
);
jest.mock('../../modules/repositories/module-repository-factory', () => ({
    createModuleRepository: () => ({}),
}));
jest.mock('../../user/repositories/user-repository-factory', () => ({
    createUserRepository: () => ({}),
}));
jest.mock(
    '../../modules/repositories/authorization-session-repository-factory',
    () => ({
        createAuthorizationSessionRepository: () => ({}),
    })
);

const { createApp } = require('../../handlers/app-handler-helpers');
const { request } = require('../test-support/http-client');
const { AuthenticateUser } = require('../../user/use-cases/authenticate-user');
const { resolveManagementApiConfig } = require('../management-api-config');
const { createManagementApiV2Router } = require('./create-v2-router');
const { getEntityTypeRegistry } = require('../../modules/entity-type-registry');

const AUTH = { authorization: 'Bearer token' };

const moduleDefinition = (moduleName, extra = {}) => ({
    moduleName,
    API: { requesterType: 'apiKey' },
    getAuthRequirementsForStep: async () => ({
        type: 'api-key',
        data: {
            jsonSchema: {
                type: 'object',
                properties: { key: { type: 'string' } },
            },
        },
    }),
    ...extra,
});

const acme = moduleDefinition('acme'); // registry-only
const hubspot = moduleDefinition('hubspot'); // bound by an integration
const integration = (name, definition) => ({
    Definition: { name, modules: { crm: { definition } } },
});

function appFor(appDefinition) {
    // loadAppDefinition() builds the registry once and hands it back.
    appDefinition = {
        ...appDefinition,
        entityTypeRegistry: getEntityTypeRegistry(appDefinition),
    };
    const config = resolveManagementApiConfig(appDefinition.managementApi);
    return createApp((app) =>
        app.use(createManagementApiV2Router({ appDefinition, config }))
    );
}

describe('v2 entity types and the app-level registry (ADR-059)', () => {
    const previousDbType = process.env.DB_TYPE;
    beforeAll(() => {
        process.env.DB_TYPE = 'postgresql';
    });
    afterAll(() => {
        if (previousDbType === undefined) delete process.env.DB_TYPE;
        else process.env.DB_TYPE = previousDbType;
    });
    beforeEach(() => {
        jest.spyOn(AuthenticateUser.prototype, 'execute').mockResolvedValue({
            getId: () => 'user-1',
        });
    });
    afterEach(() => jest.restoreAllMocks());

    const registryApp = () =>
        appFor({
            entities: { acme: { definition: acme, scope: 'global' } },
            integrations: [
                integration('sync', hubspot),
                integration('report', hubspot),
            ],
        });

    it('lists registry-only and integration-bound types, with usedBy', async () => {
        const res = await request(registryApp(), {
            path: '/api/v2/entities/types',
            headers: AUTH,
        });

        expect(res.status).toBe(200);
        expect(res.body.types.map((t) => [t.type, t.usedBy])).toEqual([
            ['acme', []],
            ['hubspot', ['sync', 'report']],
        ]);
    });

    it('describes a registry-only type: usedBy is empty', async () => {
        const res = await request(registryApp(), {
            path: '/api/v2/entities/types/acme',
            headers: AUTH,
        });

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ type: 'acme', usedBy: [] });
    });

    it('describes an integration-bound type with the integrations that bind it', async () => {
        const res = await request(registryApp(), {
            path: '/api/v2/entities/types/hubspot',
            headers: AUTH,
        });

        expect(res.body).toMatchObject({
            type: 'hubspot',
            usedBy: ['sync', 'report'],
        });
    });

    it('still answers 404 for a type that is neither registered nor bound', async () => {
        const res = await request(registryApp(), {
            path: '/api/v2/entities/types/nope',
            headers: AUTH,
        });

        expect(res.status).toBe(404);
        expect(res.body.error.code).toBe('ENTITY_TYPE_NOT_FOUND');
    });

    it('accepts a registry-only type at GET /api/v2/authorize and rejects an unknown one', async () => {
        const app = registryApp();
        const ok = await request(app, {
            path: '/api/v2/authorize?entityType=acme',
            headers: AUTH,
        });
        const unknown = await request(app, {
            path: '/api/v2/authorize?entityType=nope',
            headers: AUTH,
        });

        expect(ok.status).toBe(200);
        expect(ok.body).toMatchObject({ step: 1, totalSteps: 1 });
        expect(unknown.status).toBe(404);
    });

    it('an app with no entities key lists only what its integrations bind', async () => {
        const res = await request(
            appFor({ integrations: [integration('sync', hubspot)] }),
            {
                path: '/api/v2/entities/types',
                headers: AUTH,
            }
        );

        expect(res.body.types.map((t) => [t.type, t.usedBy])).toEqual([
            ['hubspot', ['sync']],
        ]);
    });

    it('uses the registry the loaded app definition carries instead of rebuilding one', async () => {
        const definition = {
            integrations: [integration('sync', hubspot)],
            entityTypeRegistry: getEntityTypeRegistry({
                entities: { acme: { definition: acme } },
                integrations: [],
            }),
        };
        const config = resolveManagementApiConfig(undefined);
        const app = createApp((a) =>
            a.use(
                createManagementApiV2Router({
                    appDefinition: definition,
                    config,
                })
            )
        );

        const res = await request(app, {
            path: '/api/v2/entities/types',
            headers: AUTH,
        });

        expect(res.body.types.map((t) => t.type)).toEqual(['acme']);
    });
});
