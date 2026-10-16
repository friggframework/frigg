/**
 * The deprecated v1 routes follow the same ownership rules as v2 (ADR-056 §3,
 * §3.6): the owner of what an authorization creates, who may bind an entity,
 * and which integrations a caller reaches. Real router, real scope policy and
 * real ResolveIntegrationOwnership; the repositories, the callback that talks
 * to a provider, and the integration lifecycle are the fakes.
 */
const mockState = { entities: [], integrations: [] };
const mockSame = (a, b) =>
    a !== undefined && a !== null && b !== undefined && b !== null && String(a) === String(b);

const mockRegistry = new Map([['acme', { settings: { scope: 'organization' } }]]);
jest.mock('../../handlers/app-definition-loader', () => ({
    loadAppDefinition: () => ({
        integrations: [
            {
                Definition: { name: 'sync', modules: { acme: { definition: { moduleName: 'acme' } } } },
                getOptionDetails: () => ({}),
            },
        ],
        userConfig: {},
        moduleDefinitions: [{ moduleName: 'acme', getName: () => 'acme' }],
        entityTypeRegistry: mockRegistry,
        ownership: { scope: null, individualAcross: 'organization' },
    }),
}));
jest.mock('../repositories/integration-repository-factory', () => ({
    createIntegrationRepository: () => ({
        findIntegrationById: async (id) => {
            const row = mockState.integrations.find((i) => i.id === id);
            if (!row) throw new Error(`Integration with id ${id} not found`);
            return row;
        },
    }),
}));
jest.mock('../../credential/repositories/credential-repository-factory', () => ({
    createCredentialRepository: () => ({}),
}));
jest.mock('../../modules/repositories/module-repository-factory', () => ({
    createModuleRepository: () => ({
        findEntitiesByIds: async (ids) => mockState.entities.filter((e) => ids.map(String).includes(e.id)),
    }),
}));
jest.mock('../../user/repositories/user-repository-factory', () => ({
    createUserRepository: () => ({}),
}));
jest.mock('../../user/repositories/organization-membership-repository-factory', () => ({
    createOrganizationMembershipRepository: () => ({}),
}));

const { createIntegrationRouter } = require('../integration-router');
const { createApp } = require('../../handlers/app-handler-helpers');
const { AuthenticateUser } = require('../../user/use-cases/authenticate-user');
const { User } = require('../../user/user');
const { ProcessAuthorizationCallback } = require('../../modules/use-cases/process-authorization-callback');
const { GetModuleInstanceFromType } = require('../../modules/use-cases/get-module-instance-from-type');
const { CreateIntegration } = require('../use-cases/create-integration');
const { GetIntegrationsForUser } = require('../use-cases/get-integrations-for-user');
const { GetIntegrationInstance } = require('../use-cases/get-integration-instance');
const { DeleteIntegrationForUser } = require('../use-cases/delete-integration-for-user');
const { UpdateIntegration } = require('../use-cases/update-integration');
const { GetEntitiesForUser } = require('../../modules/use-cases/get-entities-for-user');

let currentUser;
const caller = ({ individual = { id: '7', organizationId: null }, org = null, source = 'shared-secret', role } = {}) => {
    const user = new User(individual, org ? { id: String(org) } : null, false, 'individual', true, false);
    user.setAuthSource(source);
    if (role) user.setOrgRole(role);
    return user;
};

async function call(method, path, body) {
    const app = createApp((a) => a.use(createIntegrationRouter()));
    const server = await new Promise((resolve) => {
        const s = app.listen(0, () => resolve(s));
    });
    try {
        const res = await fetch(`http://127.0.0.1:${server.address().port}${path}`, {
            method,
            headers: { 'content-type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        const text = await res.text();
        return { status: res.status, body: text ? JSON.parse(text) : undefined };
    } finally {
        await new Promise((resolve) => server.close(resolve));
    }
}

const entityRow = (id, userId, organizationId) => ({
    id,
    userId: String(userId),
    organizationId: organizationId === null ? null : String(organizationId),
    moduleName: 'acme',
});

describe('v1 routes follow the ownership rules', () => {
    beforeEach(() => {
        mockState.entities = [entityRow('1', 7, 17), entityRow('2', 7, 18), entityRow('3', 17, 17)];
        mockState.integrations = [];
        currentUser = caller({ org: 17 });
        jest.spyOn(AuthenticateUser.prototype, 'execute').mockImplementation(async () => currentUser);
        for (const m of ['log', 'info', 'warn', 'error', 'debug']) {
            jest.spyOn(console, m).mockImplementation(() => {});
        }
    });
    afterEach(() => jest.restoreAllMocks());

    it('POST /api/authorize: the owner and organization come from the scope, not from user.getId()', async () => {
        const execute = jest
            .spyOn(ProcessAuthorizationCallback.prototype, 'execute')
            .mockResolvedValue({ credential_id: 'c', entity_id: 'e' });
        const res = await call('POST', '/api/authorize', { entityType: 'acme', data: { key: 'k' } });
        expect(res.status).toBe(200);
        // The registry says acme is organization-scoped: owned by organization 17, not by person 7.
        expect(execute).toHaveBeenCalledWith('17', 'acme', { key: 'k' }, {
            scope: 'organization',
            organizationId: '17',
            legacyOrgId: null,
        });
    });

    it('GET /api/authorize builds the module for the owner POST stores under, not for user.getId()', async () => {
        const instance = jest
            .spyOn(GetModuleInstanceFromType.prototype, 'execute')
            .mockResolvedValue({
                validateAuthorizationRequirements: () => true,
                getAuthorizationRequirements: () => ({ url: 'https://example.test' }),
            });
        const post = jest
            .spyOn(ProcessAuthorizationCallback.prototype, 'execute')
            .mockResolvedValue({ credential_id: 'c', entity_id: 'e' });
        expect((await call('GET', '/api/authorize?entityType=acme')).status).toBe(200);
        expect((await call('POST', '/api/authorize', { entityType: 'acme', data: { key: 'k' } })).status).toBe(200);
        // acme is organization-scoped: organization 17 owns it, not person 7.
        expect(instance.mock.calls[0][0]).toBe('17');
        expect(post.mock.calls[0][0]).toBe('17');
    });

    it('POST /api/authorize: 400 when the scope needs an organization the request does not have', async () => {
        const execute = jest.spyOn(ProcessAuthorizationCallback.prototype, 'execute');
        currentUser = caller();
        const res = await call('POST', '/api/authorize', { entityType: 'acme', data: { key: 'k' } });
        expect(res.status).toBe(400);
        expect(execute).not.toHaveBeenCalled();
    });

    it('GET /api/integrations hands the User, not an id, to both lists', async () => {
        const integrations = jest.spyOn(GetIntegrationsForUser.prototype, 'execute').mockResolvedValue([]);
        const entities = jest.spyOn(GetEntitiesForUser.prototype, 'execute').mockResolvedValue([]);
        const res = await call('GET', '/api/integrations');
        expect(res.status).toBe(200);
        expect(integrations.mock.calls[0][0]).toBe(currentUser);
        expect(entities.mock.calls[0][0]).toBe(currentUser);
    });

    describe('POST /api/integrations', () => {
        it('creates with the resolved owner and the active organization', async () => {
            const create = jest.spyOn(CreateIntegration.prototype, 'execute').mockResolvedValue({ id: 'new' });
            const res = await call('POST', '/api/integrations', { entities: ['3'], config: { type: 'sync' } });
            expect(res.status).toBe(201);
            // Every entity is the organization's: the organization owns the integration.
            expect(create).toHaveBeenCalledWith(['3'], '17', { type: 'sync' }, {
                organizationId: '17',
                adoptUnscoped: true, // an organization-owned legacy row is the organization's to reuse
            });
        });

        it('refuses an entity of another organization or another person: v1 used to check neither', async () => {
            const create = jest.spyOn(CreateIntegration.prototype, 'execute');
            mockState.entities.push(entityRow('4', 8, 17));
            for (const id of ['2', '4']) {
                const res = await call('POST', '/api/integrations', { entities: [id], config: { type: 'sync' } });
                expect(res.status).toBe(404);
            }
            expect(create).not.toHaveBeenCalled();
        });
    });

    describe('routes on one integration', () => {
        beforeEach(() => {
            mockState.integrations = [
                { id: 'mine', userId: '7', organizationId: '17', entitiesIds: ['1'], config: { type: 'sync' } },
                { id: 'org', userId: '17', organizationId: '17', entitiesIds: ['3'], config: { type: 'sync' } },
                { id: 'other', userId: '7', organizationId: '18', entitiesIds: ['2'], config: { type: 'sync' } },
            ];
        });

        it("loads with the record's owner id, so an organization integration works for a member", async () => {
            const instance = jest.spyOn(GetIntegrationInstance.prototype, 'execute').mockResolvedValue({
                id: 'org', entities: [], status: 'ENABLED', config: {},
            });
            const res = await call('GET', '/api/integrations/org');
            expect(res.status).toBe(200);
            expect(instance).toHaveBeenCalledWith('org', '17');
        });

        it('404s the same person integration from another organization, and never loads it', async () => {
            const instance = jest.spyOn(GetIntegrationInstance.prototype, 'execute');
            const res = await call('GET', '/api/integrations/other');
            expect(res.status).toBe(404);
            expect(instance).not.toHaveBeenCalled();
        });

        it('deletes with the record owner id, so a member can delete the organization integration', async () => {
            const remove = jest.spyOn(DeleteIntegrationForUser.prototype, 'execute').mockResolvedValue();
            expect((await call('DELETE', '/api/integrations/org')).status).toBe(204);
            expect(remove).toHaveBeenCalledWith('org', '17');
        });

        it('404s deleting the person integration of another organization, and deletes nothing', async () => {
            const remove = jest.spyOn(DeleteIntegrationForUser.prototype, 'execute');
            expect((await call('DELETE', '/api/integrations/other')).status).toBe(404);
            expect(remove).not.toHaveBeenCalled();
        });
    });

    describe('organization roles: a member uses an organization integration, an admin manages it', () => {
        const asToken = (role) => caller({ org: 17, source: 'adopter-jwt', role });

        beforeEach(() => {
            mockState.integrations = [
                { id: 'mine', userId: '7', organizationId: '17', entitiesIds: ['1'], config: { type: 'sync' } },
                { id: 'org', userId: '17', organizationId: '17', entitiesIds: ['3'], config: { type: 'sync' } },
            ];
        });

        it.each([['a member', 'MEMBER'], ['a token with no role', undefined]])(
            '%s: POST of an organization-owned integration is 403 and nothing is created',
            async (_name, role) => {
                const create = jest.spyOn(CreateIntegration.prototype, 'execute');
                currentUser = asToken(role);
                const res = await call('POST', '/api/integrations', { entities: ['3'], config: { type: 'sync' } });
                expect(res.status).toBe(403);
                expect(JSON.stringify(res.body)).toMatch(/organization admin|not change or delete|ORG_ADMIN/i);
                expect(create).not.toHaveBeenCalled();
            }
        );

        it('a member may still create their own integration', async () => {
            const create = jest.spyOn(CreateIntegration.prototype, 'execute').mockResolvedValue({ id: 'new' });
            currentUser = asToken('MEMBER');
            const res = await call('POST', '/api/integrations', { entities: ['1'], config: { type: 'sync' } });
            expect(res.status).toBe(201);
            expect(create.mock.calls[0][1]).toBe('7');
        });

        it('a member may read but not PATCH or DELETE the organization integration', async () => {
            const update = jest.spyOn(UpdateIntegration.prototype, 'execute');
            const remove = jest.spyOn(DeleteIntegrationForUser.prototype, 'execute');
            jest.spyOn(GetIntegrationInstance.prototype, 'execute').mockResolvedValue({
                id: 'org', entities: [], status: 'ENABLED', config: {},
            });
            currentUser = asToken('MEMBER');
            expect((await call('GET', '/api/integrations/org')).status).toBe(200);
            expect((await call('PATCH', '/api/integrations/org', { config: { type: 'sync' } })).status).toBe(403);
            expect((await call('DELETE', '/api/integrations/org')).status).toBe(403);
            expect(update).not.toHaveBeenCalled();
            expect(remove).not.toHaveBeenCalled();
        });

        it('an admin token may PATCH and DELETE it', async () => {
            const update = jest.spyOn(UpdateIntegration.prototype, 'execute').mockResolvedValue({ id: 'org' });
            const remove = jest.spyOn(DeleteIntegrationForUser.prototype, 'execute').mockResolvedValue();
            currentUser = asToken('ADMIN');
            expect((await call('PATCH', '/api/integrations/org', { config: { type: 'sync' } })).status).toBe(200);
            expect((await call('DELETE', '/api/integrations/org')).status).toBe(204);
            expect(update).toHaveBeenCalled();
            expect(remove).toHaveBeenCalledWith('org', '17');
        });
    });
});
