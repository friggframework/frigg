/**
 * No credential material in any entity or integration response, v1 or v2.
 *
 * The repositories attach the decrypted credential to every entity they
 * return, so an entity record sent as it is hands its tokens to whoever can
 * see the entity. For an organization's connection that is every member.
 * This drives the real v1 and v2 routers and use cases as a member of the
 * organization that owns the connection; the repositories are the only
 * fakes, and they return entities the way the real ones do, with the
 * decrypted credential attached.
 */
const SECRETS = {
    access_token: 'AT-org-secret-0001',
    refresh_token: 'RT-org-secret-0002',
    api_key: 'KEY-org-secret-0003',
    id_token: 'IDT-org-secret-0004',
    client_secret: 'CS-org-secret-0005',
};
const CREDENTIAL_KEYS = Object.keys(SECRETS);

jest.mock('../modules/module', () => ({
    Module: jest.fn().mockImplementation(({ userId, definition, entity }) => ({
        userId,
        entity,
        // As the real Module: the credential it was built on, decrypted.
        credential: entity?.credential,
        definition,
        apiClass: { requesterType: 'apiKey' },
        api: { delegate: null },
        name: entity?.moduleName,
        testAuth: jest.fn().mockResolvedValue(true),
        apiParamsFromCredential: jest.fn().mockReturnValue({}),
        apiParamsFromEntity: jest.fn().mockReturnValue({}),
        getName: jest.fn().mockReturnValue(entity?.moduleName ?? 'acme'),
    })),
}));

const mockState = { entities: [], integrations: [] };
const mockSame = (a, b) =>
    a !== undefined && a !== null && b !== undefined && b !== null && String(a) === String(b);
const mockMatches = (row, clauses) =>
    require('../modules/tests/doubles/ownership-matching').matchesAnyClause(row, clauses);

jest.mock('../modules/repositories/module-repository-factory', () => ({
    createModuleRepository: () => ({
        findEntitiesByOwnership: async (clauses) =>
            mockState.entities.filter((row) => mockMatches(row, clauses)),
        findEntityById: async (id) => {
            const row = mockState.entities.find((e) => String(e.id) === String(id));
            if (!row) throw new Error(`Entity ${id} not found`);
            return row;
        },
        findEntitiesByIds: async (ids) =>
            mockState.entities.filter((e) => ids.map(String).includes(String(e.id))),
        findEntitiesByUserId: async (userId) =>
            mockState.entities.filter((e) => mockSame(e.userId, userId)),
        findEntitiesByUserIdAndModuleName: async (userId, moduleName) =>
            mockState.entities.filter(
                (e) => mockSame(e.userId, userId) && e.moduleName === moduleName
            ),
        findEntities: async () => mockState.entities,
        findEntity: async () => null,
    }),
}));
jest.mock('../credential/repositories/credential-repository-factory', () => ({
    createCredentialRepository: () => ({
        findCredentialsByUserId: async () => [],
        findCredentialById: async () => null,
    }),
}));
jest.mock('../integrations/repositories/integration-repository-factory', () => ({
    createIntegrationRepository: () => ({
        findIntegrationsByOwnership: async (clauses) =>
            mockState.integrations.filter((row) => mockMatches(row, clauses)),
        findIntegrationById: async (id) => {
            const row = mockState.integrations.find((i) => String(i.id) === String(id));
            if (!row) throw new Error(`Integration with id ${id} not found`);
            return row;
        },
        findIntegrationsByUserId: async (userId) =>
            mockState.integrations.filter((i) => mockSame(i.userId, userId)),
        findIntegrationsByEntityId: async () => [],
    }),
}));
jest.mock('../user/repositories/user-repository-factory', () => ({
    createUserRepository: () => ({}),
}));
jest.mock('../user/repositories/organization-membership-repository-factory', () => ({
    createOrganizationMembershipRepository: () => ({}),
}));
jest.mock('../modules/repositories/authorization-session-repository-factory', () => ({
    createAuthorizationSessionRepository: () => ({}),
}));

const { IntegrationBase } = require('../integrations/integration-base');
const acme = {
    moduleName: 'acme',
    modelName: 'acme',
    getName: () => 'acme',
    API: { requesterType: 'apiKey' },
    requiredAuthMethods: {},
};
class SyncIntegration extends IntegrationBase {
    static Definition = {
        name: 'sync',
        version: '1.0.0',
        modules: { acme: { definition: acme } },
        display: { label: 'Sync', description: 'Sync', detailsUrl: 'https://example.com', icon: 'sync' },
    };
    static getOptionDetails() {
        return { name: 'sync' };
    }
    async initialize() {}
    async send() {
        return null;
    }
}

const { getEntityTypeRegistry } = require('../modules/entity-type-registry');
const { resolveOwnershipConfig } = require('../modules/entity-scope');
const rawDefinition = {
    integrations: [SyncIntegration],
    entities: { acme: { definition: acme, scope: 'organization' } },
    user: { primary: 'individual' },
};
const mockDefinition = (() => {
    const entityTypeRegistry = getEntityTypeRegistry(rawDefinition);
    return {
        ...rawDefinition,
        userConfig: {},
        moduleDefinitions: [acme],
        entityTypeRegistry,
        ownership: resolveOwnershipConfig(rawDefinition, entityTypeRegistry),
    };
})();
jest.mock('../handlers/app-definition-loader', () => ({
    loadAppDefinition: () => mockDefinition,
}));

const { createApp } = require('../handlers/app-handler-helpers');
const { request } = require('./test-support/http-client');
const { AuthenticateUser } = require('../user/use-cases/authenticate-user');
const { User } = require('../user/user');
const { resolveManagementApiConfig } = require('./management-api-config');
const { createManagementApiV2Router } = require('./v2/create-v2-router');
const { createIntegrationRouter } = require('../integrations/integration-router');

const ORG = '17';
const MEMBER = '7';
const AUTH = { authorization: 'Bearer token' };

function app() {
    const config = resolveManagementApiConfig(mockDefinition.managementApi);
    return createApp((a) => {
        a.use(createManagementApiV2Router({ appDefinition: mockDefinition, config }));
        a.use(createIntegrationRouter());
    });
}

// The organization's connection, as a repository returns it: the decrypted
// credential is attached, flat and under `data`.
const orgEntity = () => ({
    id: 'e-org',
    userId: ORG,
    organizationId: ORG,
    moduleName: 'acme',
    name: 'Org connection',
    externalId: 'acct-org',
    credential: {
        id: 'c-org',
        userId: ORG,
        authIsValid: true,
        ...SECRETS,
        data: { ...SECRETS },
    },
});

function expectNoCredentialMaterial(res, label) {
    const text = JSON.stringify(res.body);
    for (const value of Object.values(SECRETS)) {
        expect({ label, leaked: text.includes(value) }).toEqual({ label, leaked: false });
    }
    const walk = (node, path) => {
        if (Array.isArray(node)) return node.forEach((v, i) => walk(v, `${path}[${i}]`));
        if (node && typeof node === 'object') {
            for (const [key, value] of Object.entries(node)) {
                expect({ label, path: `${path}.${key}`, credentialKey: CREDENTIAL_KEYS.includes(key) || key === 'credential' && value && typeof value === 'object' })
                    .toEqual({ label, path: `${path}.${key}`, credentialKey: false });
                walk(value, `${path}.${key}`);
            }
        }
    };
    walk(res.body, label);
}

describe('no credential material in entity or integration responses (v1 and v2)', () => {
    const previousDbType = process.env.DB_TYPE;
    beforeAll(() => {
        process.env.DB_TYPE = 'postgresql';
    });
    afterAll(() => {
        if (previousDbType === undefined) delete process.env.DB_TYPE;
        else process.env.DB_TYPE = previousDbType;
    });
    beforeEach(() => {
        mockState.entities = [orgEntity()];
        mockState.integrations = [
            {
                id: 'i-org',
                userId: ORG,
                organizationId: ORG,
                entitiesIds: ['e-org'],
                entities: [orgEntity()],
                config: { type: 'sync' },
                status: 'ENABLED',
                version: '1.0.0',
                messages: {},
            },
        ];
        const member = new User({ id: MEMBER, organizationId: null }, { id: ORG }, false, 'individual', true, false);
        jest.spyOn(AuthenticateUser.prototype, 'execute').mockImplementation(async () => member);
        for (const m of ['log', 'info', 'warn', 'debug']) {
            jest.spyOn(console, m).mockImplementation(() => {});
        }
    });
    afterEach(() => jest.restoreAllMocks());

    const endpoints = [
        ['v1 GET /api/integrations', '/api/integrations'],
        ['v1 GET /api/integrations/:id', '/api/integrations/i-org'],
        ['v1 GET /api/entities/:id', '/api/entities/e-org'],
        ['v2 GET /api/v2/entities', '/api/v2/entities'],
        ['v2 GET /api/v2/entities/:id', '/api/v2/entities/e-org'],
        ['v2 GET /api/v2/integrations', '/api/v2/integrations'],
        ['v2 GET /api/v2/integrations/:id', '/api/v2/integrations/i-org'],
    ];

    it.each(endpoints)('%s returns the org connection without its credential', async (label, path) => {
        const res = await request(app(), { method: 'GET', path, headers: AUTH });
        expect({ label, status: res.status }).toEqual({ label, status: 200 });
        // The member does see the connection, by id: the test would pass
        // vacuously on a 404 or an empty list.
        expect(JSON.stringify(res.body)).toContain('e-org');
        expectNoCredentialMaterial(res, label);
    });

    it('reduces the credential to its id and whether it still works', async () => {
        const res = await request(app(), { method: 'GET', path: '/api/entities/e-org', headers: AUTH });
        expect(res.body).toMatchObject({ id: 'e-org', credentialId: 'c-org', authIsValid: true });
        const list = await request(app(), { method: 'GET', path: '/api/integrations', headers: AUTH });
        expect(list.body.entities.authorized[0].entity).toMatchObject({
            id: 'e-org',
            credentialId: 'c-org',
            authIsValid: true,
        });
    });
});
