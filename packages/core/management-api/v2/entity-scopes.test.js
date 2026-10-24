/**
 * ADR-056 §3 at the v2 API, through the real router, dependencies and use
 * cases. The repositories are the only fakes, and they answer the way a
 * database does: they run the owner/organization clauses they are handed, so
 * a use case that asked for the wrong rows would get the wrong rows back.
 * Module is faked because building a real API client is not what is tested.
 */
jest.mock('../../modules/module', () => ({
    Module: jest.fn().mockImplementation(({ userId, definition, entity }) => ({
        userId,
        entity,
        credential: undefined,
        definition,
        apiClass: { requesterType: 'apiKey' },
        api: { delegate: null },
        testAuth: jest.fn().mockResolvedValue(true),
        apiParamsFromCredential: jest.fn().mockReturnValue({}),
        apiParamsFromEntity: jest.fn().mockReturnValue({}),
        getName: jest.fn().mockReturnValue('acme'),
    })),
}));

const mockState = { entities: [], credentials: [], integrations: [], nextId: 100 };
const mockSame = (a, b) =>
    a !== undefined && a !== null && b !== undefined && b !== null && String(a) === String(b);

jest.mock('../../modules/repositories/module-repository-factory', () => ({
    createModuleRepository: () => ({
        findEntitiesByOwnership: async (clauses) =>
            mockState.entities.filter((row) => require('../../modules/tests/doubles/ownership-matching').matchesAnyClause(row, clauses)),
        findEntityById: async (id) => {
            const row = mockState.entities.find((e) => String(e.id) === String(id));
            if (!row) throw new Error(`Entity ${id} not found`);
            return row;
        },
        findEntitiesByIds: async (ids) =>
            mockState.entities.filter((e) => ids.map(String).includes(String(e.id))),
        findEntitiesByUserIdAndModuleName: async (userId, moduleName) =>
            mockState.entities.filter((e) => mockSame(e.userId, userId) && e.moduleName === moduleName),
        findEntities: async (filter) =>
            mockState.entities.filter(
                (e) =>
                    (filter.credentialId === undefined ||
                        String(e.credential?.id) === String(filter.credentialId)) &&
                    (filter.user === undefined || mockSame(e.userId, filter.user)) &&
                    (filter.moduleName === undefined || e.moduleName === filter.moduleName) &&
                    (filter.externalId === undefined || e.externalId === filter.externalId)
            ),
        findEntitiesByUserId: async (userId) => mockState.entities.filter((e) => mockSame(e.userId, userId)),
        findEntity: async () => null,
        createEntity: async (data, tenancy = {}) => {
            const { user, credential, ...rest } = data;
            const row = {
                ...rest,
                id: String(mockState.nextId++),
                userId: String(user),
                credential: credential ? { id: String(credential) } : null,
                organizationId: tenancy.organizationId ?? null,
            };
            mockState.entities.push(row);
            return row;
        },
        updateEntity: async () => null,
        unsetCredential: async () => true,
        deleteEntity: async (id) => {
            mockState.entities = mockState.entities.filter((e) => String(e.id) !== String(id));
            return true;
        },
    }),
}));
jest.mock('../../credential/repositories/credential-repository-factory', () => ({
    createCredentialRepository: () => ({
        findCredentialsByUserId: async (userId) =>
            mockState.credentials.filter((c) => mockSame(c.userId, userId)),
        findCredentialById: async (id) =>
            mockState.credentials.find((c) => String(c.id) === String(id)) ?? null,
        upsertCredential: async ({ identifiers, details }) => {
            const row = {
                id: `c${mockState.nextId++}`,
                userId: String(identifiers.user),
                externalId: identifiers.externalId,
                ...details,
            };
            mockState.credentials.push(row);
            return row;
        },
        deleteCredentialById: async (id) => {
            mockState.credentials = mockState.credentials.filter((c) => String(c.id) !== String(id));
            return true;
        },
    }),
}));
jest.mock('../../integrations/repositories/integration-repository-factory', () => ({
    createIntegrationRepository: () => ({
        findIntegrationsByOwnership: async (clauses) =>
            mockState.integrations.filter((row) => require('../../modules/tests/doubles/ownership-matching').matchesAnyClause(row, clauses)),
        findIntegrationById: async (id) => {
            const row = mockState.integrations.find((i) => String(i.id) === String(id));
            if (!row) throw new Error(`Integration with id ${id} not found`);
            return row;
        },
        findIntegrationsByEntityId: async () => [],
        findIntegrationsByUserId: async (userId) =>
            mockState.integrations.filter((i) => mockSame(i.userId, userId)),
        createIntegration: async (entities, userId, config, tenancy = {}) => {
            const row = {
                id: `i${mockState.nextId++}`,
                entitiesIds: entities,
                userId: String(userId),
                organizationId: tenancy.organizationId ?? null,
                config,
                version: '0.0.0',
                status: 'IN_CREATION',
                messages: {},
                createdAt: new Date(),
            };
            mockState.integrations.push(row);
            return row;
        },
        patchIntegrationConfig: async (id) => mockState.integrations.find((i) => i.id === id),
        updateIntegrationStatus: async () => true,
    }),
}));
jest.mock('../../user/repositories/user-repository-factory', () => ({
    createUserRepository: () => ({}),
}));
jest.mock('../../user/repositories/organization-membership-repository-factory', () => ({
    createOrganizationMembershipRepository: () => ({}),
}));
jest.mock('../../modules/repositories/authorization-session-repository-factory', () => ({
    createAuthorizationSessionRepository: () => ({}),
}));

const { createApp } = require('../../handlers/app-handler-helpers');
const { request } = require('../test-support/http-client');
const { AuthenticateUser } = require('../../user/use-cases/authenticate-user');
const { User } = require('../../user/user');
const { resolveManagementApiConfig } = require('../management-api-config');
const { createManagementApiV2Router } = require('./create-v2-router');
const { getEntityTypeRegistry } = require('../../modules/entity-type-registry');
const { resolveOwnershipConfig } = require('../../modules/entity-scope');

const AUTH = { authorization: 'Bearer token' };

const moduleDefinition = (moduleName, extra = {}) => ({
    moduleName,
    getName: () => moduleName,
    modelName: moduleName,
    API: { requesterType: 'apiKey' },
    requiredAuthMethods: {
        setAuthParams: async () => ({}),
        getCredentialDetails: async (_api, userId) => ({
            identifiers: { user: userId, externalId: `cred-${userId}` },
            details: { api_key: 'sk_live_0123456789abcdef' },
        }),
        getEntityDetails: async (_api, _params, _token, userId) => ({
            identifiers: { user: userId, externalId: 'acct-1' },
            details: { name: 'Acme account' },
        }),
    },
    getAuthRequirementsForStep: async () => ({
        type: 'api-key',
        data: { jsonSchema: { type: 'object', properties: { key: { type: 'string' } } } },
    }),
    ...extra,
});

const acme = moduleDefinition('acme');
const slack = moduleDefinition('slack');
const { IntegrationBase } = require('../../integrations/integration-base');

class SyncIntegration extends IntegrationBase {
    static Definition = {
        name: 'sync',
        version: '1.0.0',
        modules: { acme: { definition: acme } },
        display: {
            label: 'Sync',
            description: 'Sync',
            detailsUrl: 'https://example.com',
            icon: 'sync',
        },
    };
    static getOptionDetails() {
        return { name: 'sync' };
    }
    // The lifecycle is not under test: ownership is decided before it runs.
    async initialize() {}
    async send() {
        return null;
    }
}
const syncIntegration = SyncIntegration;

let currentUser;
const caller = ({ individual = { id: '7', organizationId: null }, org = null, source = 'shared-secret', role } = {}) => {
    const user = new User(individual, org ? { id: String(org) } : null, false, 'individual', true, false);
    user.setAuthSource(source);
    if (role) user.setOrgRole(role);
    return user;
};

function appFor(appDefinition) {
    const entityTypeRegistry = getEntityTypeRegistry(appDefinition);
    const definition = {
        ...appDefinition,
        entityTypeRegistry,
        ownership: resolveOwnershipConfig(appDefinition, entityTypeRegistry),
    };
    const config = resolveManagementApiConfig(definition.managementApi);
    return createApp((app) => app.use(createManagementApiV2Router({ appDefinition: definition, config })));
}

const entityRow = (id, userId, organizationId, extra = {}) => ({
    id,
    userId: String(userId),
    organizationId: organizationId === null ? null : String(organizationId),
    moduleName: 'acme',
    name: `entity ${id}`,
    credential: extra.credentialId ? { id: extra.credentialId, authIsValid: true } : null,
});


// The use cases build modules through the async Module.create (it resolves a
// function env); route it to the mocked constructor.
{
    const { Module: MockedModule } = require('../../modules/module');
    MockedModule.create = async (params) => new MockedModule(params);
}

describe('ownership by scope at the v2 API (ADR-056 §3)', () => {
    const previousDbType = process.env.DB_TYPE;
    beforeAll(() => {
        process.env.DB_TYPE = 'postgresql';
    });
    afterAll(() => {
        if (previousDbType === undefined) delete process.env.DB_TYPE;
        else process.env.DB_TYPE = previousDbType;
    });
    beforeEach(() => {
        mockState.entities = [];
        mockState.credentials = [];
        mockState.integrations = [];
        mockState.nextId = 100;
        currentUser = caller({ org: 17 });
        jest.spyOn(AuthenticateUser.prototype, 'execute').mockImplementation(async () => currentUser);
    });
    afterEach(() => jest.restoreAllMocks());

    const app = (extra = {}) =>
        appFor({
            integrations: [syncIntegration],
            entities: { slack: { definition: slack, scope: 'organization' } },
            ...extra,
        });

    describe('authorize', () => {
        it('creates an individual entity owned by the person, in the active organization', async () => {
            const res = await request(app(), {
                method: 'POST',
                path: '/api/v2/authorize',
                headers: AUTH,
                body: { entityType: 'acme', data: { key: 'k' } },
            });
            expect(res.status).toBe(200);
            expect(res.body.entity).toMatchObject({
                scope: 'individual',
                owner: { type: 'individual', id: '7' },
                organizationId: '17',
                access: 'manage',
            });
            expect(mockState.entities[0]).toMatchObject({ userId: '7', organizationId: '17' });
            expect(mockState.credentials[0].userId).toBe('7');
        });

        it('creates an organization entity owned by the organization when the registry says so', async () => {
            const res = await request(app(), {
                method: 'POST',
                path: '/api/v2/authorize',
                headers: AUTH,
                body: { entityType: 'slack', data: { key: 'k' } },
            });
            expect(res.status).toBe(200);
            expect(res.body.entity).toMatchObject({
                scope: 'organization',
                owner: { type: 'organization', id: '17' },
                organizationId: '17',
            });
            expect(mockState.entities[0]).toMatchObject({ userId: '17', organizationId: '17' });
        });

        it('lets the request choose within the allow list and refuses outside it', async () => {
            const flexible = app({
                entities: {
                    slack: { definition: slack, scope: { default: 'organization', allow: ['organization', 'individual'] } },
                },
            });
            const asIndividual = await request(flexible, {
                method: 'POST', path: '/api/v2/authorize', headers: AUTH,
                body: { entityType: 'slack', scope: 'individual', data: { key: 'k' } },
            });
            expect(asIndividual.body.entity).toMatchObject({ scope: 'individual', owner: { id: '7' } });

            const refused = await request(app(), {
                method: 'POST', path: '/api/v2/authorize', headers: AUTH,
                body: { entityType: 'slack', scope: 'individual', data: { key: 'k' } },
            });
            expect(refused.status).toBe(403);
            expect(refused.body.error.code).toBe('SCOPE_NOT_ALLOWED');
        });

        it('refuses global with 403 and a clear message, and creates nothing', async () => {
            const res = await request(app(), {
                method: 'POST', path: '/api/v2/authorize', headers: AUTH,
                body: { entityType: 'acme', scope: 'global', data: { key: 'k' } },
            });
            expect(res.status).toBe(403);
            expect(res.body.error.message).toMatch(/app owner through admin routes/);
            expect(mockState.entities).toHaveLength(0);
        });

        it('400s an organization entity with no active organization, naming the header', async () => {
            currentUser = caller();
            const res = await request(app(), {
                method: 'POST', path: '/api/v2/authorize', headers: AUTH,
                body: { entityType: 'slack', data: { key: 'k' } },
            });
            expect(res.status).toBe(400);
            expect(res.body.error.details.field).toBe('x-frigg-apporgid');
        });

        it("under individualAcross 'all' stores the entity with no organization", async () => {
            const res = await request(app({ ownership: { individualAcross: 'all' } }), {
                method: 'POST', path: '/api/v2/authorize', headers: AUTH,
                body: { entityType: 'acme', data: { key: 'k' } },
            });
            expect(res.body.entity).toMatchObject({ scope: 'individual', organizationId: null });
            expect(mockState.entities[0].organizationId).toBeNull();
        });
    });

    describe('lists', () => {
        beforeEach(() => {
            mockState.entities = [
                entityRow('1', 7, 17, { credentialId: 'c1' }),
                entityRow('2', 7, 18, { credentialId: 'c1' }),
                entityRow('3', 17, 17, { credentialId: 'c17' }),
                entityRow('4', 8, 17),
                entityRow('5', 18, 18),
            ];
            mockState.credentials = [
                { id: 'c1', userId: '7', authIsValid: true, access_token: 'sk_live_0123456789abcdef' },
                { id: 'c17', userId: '17', authIsValid: true, api_key: 'sk_live_0123456789abcdef' },
            ];
        });
        const ids = (list) => list.map((e) => e.id).sort();

        it('lists entities per active organization with scope, owner, organizationId and access', async () => {
            const res = await request(app(), { path: '/api/v2/entities', headers: AUTH });
            expect(res.status).toBe(200);
            expect(ids(res.body.entities)).toEqual(['1', '3']);
            expect(res.body.entities.find((e) => e.id === '3')).toMatchObject({
                scope: 'organization',
                owner: { type: 'organization', id: '17' },
                organizationId: '17',
                access: 'manage',
            });
            currentUser = caller({ org: 18 });
            const other = await request(app(), { path: '/api/v2/entities', headers: AUTH });
            expect(ids(other.body.entities)).toEqual(['2', '5']);
        });

        it('filters by ?scope and ?owner, and 400s a value it does not know', async () => {
            const byScope = await request(app(), { path: '/api/v2/entities?scope=organization', headers: AUTH });
            expect(ids(byScope.body.entities)).toEqual(['3']);
            const byOwner = await request(app(), { path: '/api/v2/entities?owner=me', headers: AUTH });
            expect(ids(byOwner.body.entities)).toEqual(['1']);
            const bad = await request(app(), { path: '/api/v2/entities?scope=global', headers: AUTH });
            expect(bad.status).toBe(400);
        });

        it('gets one entity in its organization and 404s it from another', async () => {
            const ok = await request(app(), { path: '/api/v2/entities/1', headers: AUTH });
            expect(ok.status).toBe(200);
            expect(ok.body).toMatchObject({ scope: 'individual', organizationId: '17' });
            currentUser = caller({ org: 18 });
            const elsewhere = await request(app(), { path: '/api/v2/entities/1', headers: AUTH });
            expect(elsewhere.status).toBe(404);
        });

        it('lists integrations per active organization with the same fields', async () => {
            mockState.integrations = [
                { id: 'i1', userId: '7', organizationId: '17', entitiesIds: ['1'], config: { type: 'sync' }, status: 'ENABLED' },
                { id: 'i2', userId: '7', organizationId: '18', entitiesIds: ['2'], config: { type: 'sync' }, status: 'ENABLED' },
                { id: 'i3', userId: '17', organizationId: '17', entitiesIds: ['3'], config: { type: 'sync' }, status: 'ENABLED' },
            ];
            const res = await request(app(), { path: '/api/v2/integrations', headers: AUTH });
            expect(res.status).toBe(200);
            expect(res.body.integrations.map((i) => [i.id, i.scope, i.organizationId, i.access]).sort()).toEqual([
                ['i1', 'individual', '17', 'manage'],
                ['i3', 'organization', '17', 'manage'],
            ]);
            const filtered = await request(app(), { path: '/api/v2/integrations?owner=org', headers: AUTH });
            expect(filtered.body.integrations.map((i) => i.id)).toEqual(['i3']);
        });
    });

    describe('organization roles', () => {
        const asToken = (role) => caller({ org: 17, source: 'adopter-jwt', role });
        const authorizeSlack = () =>
            request(app(), {
                method: 'POST', path: '/api/v2/authorize', headers: AUTH,
                body: { entityType: 'slack', data: { key: 'k' } },
            });

        it('a member cannot connect an organization-level account: 403 ORG_ADMIN_REQUIRED, nothing created', async () => {
            for (const role of ['MEMBER', undefined]) {
                currentUser = asToken(role);
                const res = await authorizeSlack();
                expect(res.status).toBe(403);
                expect(res.body.error.code).toBe('ORG_ADMIN_REQUIRED');
            }
            expect(mockState.entities).toHaveLength(0);
            expect(mockState.credentials).toHaveLength(0);
        });

        it('an admin token and a header (shared-secret) caller can', async () => {
            currentUser = asToken('ADMIN');
            expect((await authorizeSlack()).status).toBe(200);
            currentUser = caller({ org: 17 });
            expect((await authorizeSlack()).status).toBe(200);
            // the same account: the second connect reuses the organization's entity
            expect(mockState.entities).toHaveLength(1);
        });

        it('the configured admin roles are honoured', async () => {
            currentUser = asToken('OWNER');
            const res = await request(app({ user: { orgAdminRoles: ['owner'] } }), {
                method: 'POST', path: '/api/v2/authorize', headers: AUTH,
                body: { entityType: 'slack', data: { key: 'k' } },
            });
            expect(res.status).toBe(200);
        });

        it('a member lists and uses the organization entity but cannot delete it; an admin can', async () => {
            mockState.entities = [entityRow('3', 17, 17)];
            currentUser = asToken('MEMBER');
            const list = await request(app(), { method: 'GET', path: '/api/v2/entities', headers: AUTH });
            expect(list.status).toBe(200);
            expect(JSON.stringify(list.body)).toContain('"access":"use"');
            const refused = await request(app(), { method: 'DELETE', path: '/api/v2/entities/3', headers: AUTH });
            expect(refused.status).toBe(403);
            expect(refused.body.error.code).toBe('ORG_ADMIN_REQUIRED');
            expect(mockState.entities).toHaveLength(1);
            currentUser = asToken('ADMIN');
            const ok = await request(app(), { method: 'DELETE', path: '/api/v2/entities/3', headers: AUTH });
            expect(ok.status).toBeLessThan(300);
            expect(mockState.entities).toHaveLength(0);
        });
    });

    describe('organization credentials (the organization-primary caller owns them)', () => {
        const orgPrimary = (role, source = 'adopter-jwt') => {
            const user = new User({ id: '7', type: 'INDIVIDUAL' }, { id: '17' }, false, 'organization', true, true);
            user.setAuthSource(source);
            if (role) user.setOrgRole(role);
            return user;
        };
        const remove = (extra) =>
            request(app(extra), { method: 'DELETE', path: '/api/v2/credentials/c17', headers: AUTH });
        beforeEach(() => {
            mockState.credentials = [{ id: 'c17', userId: '17', authIsValid: true }];
        });

        it('a member cannot delete it (403), an admin can, and the configured roles apply', async () => {
            currentUser = orgPrimary('MEMBER');
            const refused = await remove();
            expect(refused.status).toBe(403);
            expect(refused.body.error.code).toBe('ORG_ADMIN_REQUIRED');
            expect(mockState.credentials).toHaveLength(1);

            currentUser = orgPrimary('ADMIN');
            expect((await remove()).status).toBeLessThan(300);
            expect(mockState.credentials).toHaveLength(0);

            // user.orgAdminRoles reaches the credential gate through the app definition
            mockState.credentials = [{ id: 'c17', userId: '17', authIsValid: true }];
            currentUser = orgPrimary('OWNER');
            expect((await remove({ user: { orgAdminRoles: ['owner'] } })).status).toBeLessThan(300);
            expect(mockState.credentials).toHaveLength(0);
        });
    });

    describe('wiring: the one scope policy, with the app admin roles, reaches every manage gate', () => {
        it('credential list and get hold the app policy, not the default', () => {
            const { buildV2Dependencies } = require('./dependencies');
            const definition = {
                integrations: [syncIntegration],
                entities: { slack: { definition: slack, scope: 'organization' } },
                user: { orgAdminRoles: ['owner'] },
            };
            const entityTypeRegistry = getEntityTypeRegistry(definition);
            const deps = buildV2Dependencies({
                appDefinition: {
                    ...definition,
                    entityTypeRegistry,
                    ownership: resolveOwnershipConfig(definition, entityTypeRegistry),
                },
                config: resolveManagementApiConfig(undefined),
            });
            // Delete and re-authorize read access from the credential the Get use case describes.
            expect(deps.getCredentialForUser.scopePolicy.orgAdminRoles).toEqual(['owner']);
            expect(deps.listCredentialsForUser.scopePolicy.orgAdminRoles).toEqual(['owner']);
        });
    });

    describe('re-authorizing an organization credential', () => {
        const orgPrimary = (role) => {
            const user = new User({ id: '7', type: 'INDIVIDUAL' }, { id: '17' }, false, 'organization', true, true);
            user.setAuthSource('adopter-jwt');
            user.setOrgRole(role);
            return user;
        };
        beforeEach(() => {
            mockState.credentials = [{ id: 'c17', userId: '17', authIsValid: true }];
            mockState.entities = [entityRow('3', 17, 17, { credentialId: 'c17' })];
        });
        const reauthorize = (extra) =>
            request(app(extra), {
                method: 'POST', path: '/api/v2/credentials/c17/reauthorize', headers: AUTH,
                body: { data: { key: 'k' } },
            });

        it('403s a member, and honours user.orgAdminRoles: ADMIN is refused once the app says only OWNER manages', async () => {
            currentUser = orgPrimary('MEMBER');
            const member = await reauthorize();
            expect(member.status).toBe(403);
            expect(member.body.error.code).toBe('ORG_ADMIN_REQUIRED');
            currentUser = orgPrimary('ADMIN');
            const admin = await reauthorize({ user: { orgAdminRoles: ['owner'] } });
            expect(admin.status).toBe(403);
            expect(admin.body.error.code).toBe('ORG_ADMIN_REQUIRED');
        });
    });

    describe('credentials are scoped through their entities (ADR-056 §3.4)', () => {
        const getJson = (path, extra) => request(app(extra), { method: 'GET', path, headers: AUTH });
        const reauthorize = (id) =>
            request(app(), {
                method: 'POST', path: `/api/v2/credentials/${id}/reauthorize`, headers: AUTH,
                body: { data: { key: 'k' } },
            });
        const createdCredentials = () =>
            mockState.credentials.filter((c) => !['c7', 'c17', 'c18', 'orphan'].includes(c.id));
        beforeEach(() => {
            mockState.credentials = [
                { id: 'c7', userId: '7', authIsValid: true, access_token: 'secret-token-value' },
                { id: 'c17', userId: '17', authIsValid: true },
                { id: 'c18', userId: '18', authIsValid: true },
                { id: 'orphan', userId: '7', authIsValid: false },
            ];
            mockState.entities = [
                entityRow('e17', 7, 17, { credentialId: 'c7' }),
                entityRow('e18', 7, 18, { credentialId: 'c7' }),
                { ...entityRow('o17', 17, 17, { credentialId: 'c17' }), moduleName: 'slack' },
                entityRow('o18', 18, 18, { credentialId: 'c18' }),
            ];
        });

        it('lists the credentials of the active organization with scope, owner, organizationId and access', async () => {
            const res = await getJson('/api/v2/credentials');
            expect(res.status).toBe(200);
            const byId = Object.fromEntries(res.body.credentials.map((c) => [c.id, c]));
            expect(Object.keys(byId).sort()).toEqual(['c17', 'c7', 'orphan']);
            expect(byId.c7).toMatchObject({ scope: 'individual', organizationId: '17', access: 'manage', entityIds: ['e17'] });
            expect(byId.c17).toMatchObject({ scope: 'organization', owner: { type: 'organization', id: '17' }, access: 'manage' });
            // Tenancy is metadata, never provider data: nothing leaks into the masked data.
            expect(byId.c7.data).not.toHaveProperty('tenancy');
            expect(JSON.stringify(res.body)).not.toContain('secret-token-value');
        });

        it('?scope and ?owner filter, and a bad value is 400', async () => {
            const org = await getJson('/api/v2/credentials?scope=organization');
            expect(org.body.credentials.map((c) => c.id)).toEqual(['c17']);
            const mine = await getJson('/api/v2/credentials?owner=me');
            expect(mine.body.credentials.map((c) => c.id).sort()).toEqual(['c7', 'orphan']);
            expect((await getJson('/api/v2/credentials?scope=nope')).status).toBe(400);
        });

        it("another organization's credential is a 404, and so is the person's when only another organization uses it", async () => {
            expect((await getJson('/api/v2/credentials/c18')).status).toBe(404);
            mockState.entities = mockState.entities.filter((e) => e.id !== 'e17');
            expect((await getJson('/api/v2/credentials/c7')).status).toBe(404);
        });

        it('a member uses the organization credential but cannot delete it, even from an individual-primary session', async () => {
            currentUser = caller({ org: 17, source: 'adopter-jwt', role: 'MEMBER' });
            const got = await getJson('/api/v2/credentials/c17');
            expect(got.body.access).toBe('use');
            const refused = await request(app(), { method: 'DELETE', path: '/api/v2/credentials/c17', headers: AUTH });
            expect(refused.status).toBe(403);
            expect(mockState.credentials.map((c) => c.id)).toContain('c17');
        });

        it('deleting a credential another organization still uses is 409 CREDENTIAL_SHARED, and the body says nothing about it', async () => {
            const res = await request(app(), { method: 'DELETE', path: '/api/v2/credentials/c7', headers: AUTH });
            expect(res.status).toBe(409);
            expect(res.body.error.code).toBe('CREDENTIAL_SHARED');
            expect(JSON.stringify(res.body)).not.toMatch(/e18|18|otherEntityCount/);
            expect(mockState.credentials.map((c) => c.id)).toContain('c7');
        });

        it('re-authorizing keeps the scope the connection has, whatever the config says now', async () => {
            // c7 is the person's. slack is organization-scoped in this app, but this connection was made individually.
            mockState.entities = [{ ...entityRow('e17', 7, 17, { credentialId: 'c7' }), moduleName: 'slack' }];
            expect((await reauthorize('c7')).status).toBe(200);
            expect(createdCredentials().map((c) => c.userId)).toEqual(['7']);
        });

        it("and keeps the organization's: an organization connection stays the organization's when the config says individual", async () => {
            // acme is individual in this app, but this connection (c17) is the organization's.
            mockState.entities = [{ ...entityRow('o17', 17, 17, { credentialId: 'c17' }), moduleName: 'acme' }];
            expect((await reauthorize('c17')).status).toBe(200);
            expect(createdCredentials().map((c) => c.userId)).toEqual(['17']);
        });
    });

    describe('integrations', () => {
        beforeEach(() => {
            mockState.entities = [
                entityRow('1', 7, 17, { credentialId: 'c1' }),
                entityRow('2', 7, 18, { credentialId: 'c1' }),
                entityRow('3', 8, 17, { credentialId: 'c8' }),
            ];
        });
        const create = (entities, extra = {}) =>
            request(app(), {
                method: 'POST', path: '/api/v2/integrations', headers: AUTH,
                body: { entities, config: { type: 'sync' }, ...extra },
            });

        it('creates one owned by the person and paired with the active organization', async () => {
            const res = await create(['1']);
            expect(res.status).toBe(201);
            expect(mockState.integrations).toHaveLength(1);
            expect(mockState.integrations[0]).toMatchObject({ userId: '7', organizationId: '17' });
        });

        it('refuses an entity connected in another organization, and a colleague one, with 404 and no write', async () => {
            for (const entities of [['2'], ['3']]) {
                const res = await create(entities);
                expect(res.status).toBe(404);
            }
            expect(mockState.integrations).toHaveLength(0);
        });

        it('does not reuse an integration from another organization', async () => {
            await create(['1']);
            currentUser = caller({ org: 18 });
            const res = await create(['2']);
            expect(res.status).toBe(201);
            expect(mockState.integrations.map((i) => i.organizationId).sort()).toEqual(['17', '18']);
        });
    });

    describe('entity types', () => {
        it('say which scope a connection gets and which a request may choose', async () => {
            const res = await request(
                app({
                    entities: {
                        slack: { definition: slack, scope: { default: 'organization', allow: ['organization', 'individual'] } },
                    },
                }),
                { path: '/api/v2/entities/types', headers: AUTH }
            );
            const byType = Object.fromEntries(res.body.types.map((t) => [t.type, t.scope]));
            expect(byType.slack).toEqual({ default: 'organization', allow: ['organization', 'individual'], source: 'entityType' });
            expect(byType.acme).toEqual({ default: 'individual', allow: ['individual'], source: 'default' });
        });
    });
});
