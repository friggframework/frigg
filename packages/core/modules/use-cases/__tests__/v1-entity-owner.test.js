/**
 * The v1 entity routes decide the owner by scope, as /api/authorize does
 * (ADR-056 §3.2), and build a Module for the entity's OWNER, so a token
 * refresh never writes a credential under the caller.
 *
 * The Module is the only fake; the scope policy, AuthorizeEntityForUser and
 * ProcessAuthorizationCallback.findOrCreateEntity are real.
 */
jest.mock('../../module', () => {
    const Module = jest.fn().mockImplementation(({ userId, definition, entity }) => ({
        userId,
        entity,
        credential: entity?.credential,
        definition,
        api: { tokens: entity?.credential?.data },
        testAuth: jest.fn().mockResolvedValue(true),
        apiParamsFromEntity: jest.fn().mockReturnValue({}),
        getEntityOptions: jest.fn().mockReturnValue({ options: [] }),
        refreshEntityOptions: jest.fn().mockResolvedValue({ options: [] }),
    }));
    Module.getEntityModelFromDefinition = (def) => ({ modelName: def.moduleName });
    return { Module };
});

const { Module } = require('../../module');
const { User } = require('../../../user/user');
const { createScopePolicy } = require('../../scope-policy');
const { AuthorizeEntityForUser } = require('../authorize-entity-for-user');
const { ProcessAuthorizationCallback } = require('../process-authorization-callback');
const { CreateEntityFromCredential } = require('../create-entity-from-credential');
const { TestModuleAuth } = require('../test-module-auth');
const { GetModule } = require('../get-module');
const { GetEntityOptionsById } = require('../get-entity-options-by-id');
const { RefreshEntityOptions } = require('../refresh-entity-options');

// Default: the app's own backend (shared secret), which may manage the
// organization; `source`/`role` model a person's token.
const caller = ({ org = null, primary = 'individual', source = 'shared-secret', role } = {}) => {
    const user = new User({ id: '7', organizationId: null }, org ? { id: String(org) } : null, false, primary, true, false);
    user.setAuthSource(source);
    if (role) user.setOrgRole(role);
    return user;
};

function definition(calls) {
    return {
        moduleName: 'acme',
        getName: () => 'acme',
        API: class {},
        requiredAuthMethods: {
            getEntityDetails: jest.fn(async (api, _p, _t, userId) => {
                calls.push({ userId, tokens: api.tokens });
                return {
                    identifiers: { user: userId, externalId: 'acct-1' },
                    details: { name: 'Acme' },
                };
            }),
        },
    };
}

function buildCreate({ registry, credential } = {}) {
    const calls = [];
    const moduleDefinitions = [definition(calls)];
    const moduleRepository = {
        findEntities: jest.fn(async () => []),
        createEntity: jest.fn(async (data, tenancy) => ({ id: 'new', ...data, tenancy })),
        updateEntity: jest.fn(),
    };
    const credentialRepository = {
        findCredentialById: jest.fn(async () => credential),
    };
    const processAuthorizationCallback = new ProcessAuthorizationCallback({
        moduleRepository,
        credentialRepository,
        moduleDefinitions,
    });
    const scopePolicy = createScopePolicy({ entityTypeRegistry: registry });
    const useCase = new CreateEntityFromCredential({
        authorizeEntityForUser: new AuthorizeEntityForUser({
            scopePolicy,
            processAuthorizationCallback,
        }),
        processAuthorizationCallback,
        credentialRepository,
        moduleDefinitions,
    });
    return { useCase, moduleRepository, calls };
}

const create = (t, user) =>
    t.useCase.execute({ user, entityType: 'acme', credentialId: 'c1' });

const credentialOf = (userId) => ({
    id: 'c1',
    userId,
    externalId: 'acct-1',
    authIsValid: true,
    access_token: 'tok',
});

beforeEach(() => jest.clearAllMocks());


// The use cases build modules through the async Module.create (it resolves a
// function env); route it to the mocked constructor.
{
    const { Module: MockedModule } = require('../../module');
    MockedModule.create = async (params) => new MockedModule(params);
}

describe('POST /api/entity (CreateEntityFromCredential)', () => {
    const orgScoped = new Map([['acme', { settings: { scope: 'organization' } }]]);

    it('an individual type: owned by the person, paired with the active organization', async () => {
        const t = buildCreate({ credential: credentialOf('7') });
        await create(t, caller({ org: 17 }));
        const [data, tenancy] = t.moduleRepository.createEntity.mock.calls[0];
        expect(data.user).toBe('7');
        expect(data.credential).toBe('c1');
        expect(tenancy).toEqual({ organizationId: '17' });
        expect(Module.mock.calls[0][0].userId).toBe('7');
    });

    it('an organization type: owned by the active organization, not by user.getId()', async () => {
        const t = buildCreate({ registry: orgScoped, credential: credentialOf('17') });
        await create(t, caller({ org: 17 }));
        const [data, tenancy] = t.moduleRepository.createEntity.mock.calls[0];
        expect(data.user).toBe('17');
        expect(tenancy).toEqual({ organizationId: '17' });
        expect(t.calls[0].userId).toBe('17');
        expect(Module.mock.calls[0][0].userId).toBe('17');
    });

    it('loads the credential into the module, so the provider call is authenticated', async () => {
        const t = buildCreate({ credential: credentialOf('7') });
        await create(t, caller({ org: 17 }));
        expect(t.calls[0].tokens).toEqual({ access_token: 'tok' });
    });

    it("refuses a credential that is not the resolved owner's (the person's own, for an organization type)", async () => {
        const t = buildCreate({ registry: orgScoped, credential: credentialOf('7') });
        await expect(create(t, caller({ org: 17 }))).rejects.toMatchObject({
            output: { statusCode: 400 },
            data: { code: 'INVALID_CREDENTIAL' },
        });
        expect(t.moduleRepository.createEntity).not.toHaveBeenCalled();
    });

    it('a missing credential and a stranger’s get the same 400', async () => {
        for (const credential of [null, credentialOf('99')]) {
            const t = buildCreate({ credential });
            await expect(create(t, caller({ org: 17 }))).rejects.toMatchObject({
                output: { statusCode: 400 },
                data: { code: 'INVALID_CREDENTIAL' },
            });
        }
    });

    it('400 IDENTITY_REQUIRED when the scope needs an organization the request lacks', async () => {
        const t = buildCreate({ registry: orgScoped, credential: credentialOf('17') });
        await expect(create(t, caller())).rejects.toMatchObject({
            output: { statusCode: 400 },
            data: { code: 'IDENTITY_REQUIRED' },
        });
        expect(t.moduleRepository.createEntity).not.toHaveBeenCalled();
    });

    it.each([['a member token', 'MEMBER'], ['a token with no role', undefined]])(
        '%s: an organization type is 403 ORG_ADMIN_REQUIRED, before the credential is read',
        async (_name, role) => {
            const t = buildCreate({ registry: orgScoped, credential: credentialOf('17') });
            await expect(
                create(t, caller({ org: 17, source: 'adopter-jwt', role }))
            ).rejects.toMatchObject({
                output: { statusCode: 403 },
                data: { code: 'ORG_ADMIN_REQUIRED' },
            });
            expect(t.moduleRepository.createEntity).not.toHaveBeenCalled();
            expect(Module).not.toHaveBeenCalled();
        }
    );

    it('an admin token may create the organization entity', async () => {
        const t = buildCreate({ registry: orgScoped, credential: credentialOf('17') });
        await create(t, caller({ org: 17, source: 'adopter-jwt', role: 'ADMIN' }));
        expect(t.moduleRepository.createEntity.mock.calls[0][0].user).toBe('17');
    });

    it('a member token may still create their own individual entity', async () => {
        const t = buildCreate({ credential: credentialOf('7') });
        await create(t, caller({ org: 17, source: 'adopter-jwt', role: 'MEMBER' }));
        expect(t.moduleRepository.createEntity.mock.calls[0][0].user).toBe('7');
    });

    it('an unknown entity type is a 400', async () => {
        const t = buildCreate({ credential: credentialOf('7') });
        await expect(
            t.useCase.execute({ user: caller(), entityType: 'nope', credentialId: 'c1' })
        ).rejects.toMatchObject({ output: { statusCode: 400 } });
    });
});

describe('v1 entity reads build the module for the entity owner', () => {
    const orgEntity = {
        id: '5',
        userId: '17',
        organizationId: '17',
        moduleName: 'acme',
        name: 'Acme',
        user: '17',
        credential: { id: 'c1', userId: '17', data: {} },
    };
    const deps = () => ({
        moduleRepository: { findEntityById: jest.fn(async () => orgEntity) },
        moduleDefinitions: [definition([])],
        scopePolicy: createScopePolicy({}),
    });
    // A member of organization 17 (individual-primary: getId() is the person).
    const member = () => caller({ org: 17 });

    it.each([
        ['TestModuleAuth', (d) => new TestModuleAuth(d).execute('5', member())],
        ['GetModule', (d) => new GetModule(d).execute('5', member())],
        ['GetEntityOptionsById', (d) => new GetEntityOptionsById(d).execute('5', member())],
        ['RefreshEntityOptions', (d) => new RefreshEntityOptions(d).execute('5', member(), {})],
    ])('%s: Module userId is the owner (17), not the caller (7)', async (_name, run) => {
        await run(deps());
        expect(Module).toHaveBeenCalledTimes(1);
        expect(Module.mock.calls[0][0].userId).toBe('17');
    });
});
