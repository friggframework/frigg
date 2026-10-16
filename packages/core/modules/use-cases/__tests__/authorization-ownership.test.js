/**
 * Who owns an entity an authorization creates, and which organization it is
 * paired with (ADR-056 §3.2, §3.6). The module is the only fake; the scope
 * policy, SubmitAuthorizationStep and ProcessAuthorizationCallback are real.
 */
jest.mock('../../module', () => ({
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

const { User } = require('../../../user/user');
const { ProcessAuthorizationCallback } = require('../process-authorization-callback');
const { SubmitAuthorizationStep } = require('../multi-step-authorization');
const { AuthorizeEntityForUser } = require('../authorize-entity-for-user');
const { createScopePolicy } = require('../../scope-policy');
const {
    InMemoryAuthorizationSessionRepository,
} = require('../../tests/doubles/in-memory-authorization-session-repository');

const caller = ({ individual = { id: '7', organizationId: null }, org = null, primary = 'individual', source = 'shared-secret', role } = {}) => {
    const user = new User(individual, org ? { id: String(org) } : null, false, primary, true, false);
    user.setAuthSource(source);
    if (role) user.setOrgRole(role);
    return user;
};

function build({ existing = [], registry, ownership } = {}) {
    const calls = { getEntityDetailsUserId: [], credentialUserId: [] };
    const moduleDefinitions = [
        {
            moduleName: 'acme',
            modelName: 'Acme',
            API: class {},
            requiredAuthMethods: {
                setAuthParams: jest.fn().mockResolvedValue({}),
                getCredentialDetails: jest.fn(async (_api, userId) => {
                    calls.credentialUserId.push(userId);
                    return { identifiers: { user: userId, externalId: 'cred-ext' }, details: { api_key: 's' } };
                }),
                getEntityDetails: jest.fn(async (_api, _params, _token, userId) => {
                    calls.getEntityDetailsUserId.push(userId);
                    return {
                        identifiers: { user: userId, externalId: 'acct-1' },
                        // A provider field that happens to be called organizationId.
                        details: { name: 'Acme', organizationId: 'provider-org' },
                    };
                }),
            },
        },
    ];
    const moduleRepository = {
        findEntitiesByUserIdAndModuleName: jest.fn(async () => existing),
        findEntities: jest.fn(async () => existing),
        createEntity: jest.fn(async (data, tenancy) => ({ id: 'new', ...data, tenancy })),
        updateEntity: jest.fn(),
        findEntityById: jest.fn(async (id) => ({ id, userId: 'owner', moduleName: 'acme' })),
    };
    const credentialRepository = {
        upsertCredential: jest.fn(async () => ({ id: 'cred-1', authIsValid: true })),
        findCredentialById: jest.fn(async (id) => ({ id })),
    };
    const processAuthorizationCallback = new ProcessAuthorizationCallback({
        moduleRepository,
        credentialRepository,
        moduleDefinitions,
    });
    const scopePolicy = createScopePolicy({ ownership, entityTypeRegistry: registry });
    const submit = new SubmitAuthorizationStep({
        moduleDefinitions,
        authorizationSessionRepository: new InMemoryAuthorizationSessionRepository(),
        getAuthorizationRequirements: {},
        authorizeEntityForUser: new AuthorizeEntityForUser({ scopePolicy, processAuthorizationCallback }),
        moduleRepository,
        credentialRepository,
        scopePolicy,
    });
    return { submit, moduleRepository, calls, processAuthorizationCallback };
}

const authorize = (t, user, extra = {}) =>
    t.submit.execute({ user, entityType: 'acme', data: { api_key: 'k' }, ...extra });

describe('authorizing an individual entity', () => {
    it('owns it by the person and pairs it with the active organization', async () => {
        const t = build();
        await authorize(t, caller({ org: 17 }));
        const [data, tenancy] = t.moduleRepository.createEntity.mock.calls[0];
        expect(data.user).toBe('7');
        expect(tenancy).toEqual({ organizationId: '17' });
        // The module saw the owner, and the credential is the owner's.
        expect(t.calls.getEntityDetailsUserId).toEqual(['7']);
        expect(t.calls.credentialUserId).toEqual(['7']);
    });

    it('does not take a provider field called organizationId for the organization', async () => {
        const t = build();
        await authorize(t, caller({ org: 17 }));
        const [data, tenancy] = t.moduleRepository.createEntity.mock.calls[0];
        expect(data.organizationId).toBe('provider-org'); // stays provider data
        expect(tenancy.organizationId).toBe('17'); // ours
    });

    it('with no active organization: paired with none', async () => {
        const t = build();
        await authorize(t, caller());
        expect(t.moduleRepository.createEntity.mock.calls[0][1]).toEqual({ organizationId: null });
    });

    it("under individualAcross 'all': stored with no organization, even inside one", async () => {
        const t = build({ ownership: { individualAcross: 'all' } });
        await authorize(t, caller({ org: 17 }));
        expect(t.moduleRepository.createEntity.mock.calls[0][1]).toEqual({ organizationId: null });
    });

    it('in an organization-primary app, still owned by the person when the type says individual', async () => {
        const registry = new Map([['acme', { settings: { scope: 'individual' } }]]);
        const t = build({ registry });
        await authorize(t, caller({ org: 17, primary: 'organization' }));
        const [data, tenancy] = t.moduleRepository.createEntity.mock.calls[0];
        expect(data.user).toBe('7');
        expect(tenancy.organizationId).toBe('17');
    });
});

describe('authorizing an organization entity', () => {
    const registry = new Map([['acme', { settings: { scope: 'organization' } }]]);

    it('owns it by the active organization user, in that organization', async () => {
        const t = build({ registry });
        await authorize(t, caller({ org: 17 }));
        const [data, tenancy] = t.moduleRepository.createEntity.mock.calls[0];
        expect(data.user).toBe('17');
        expect(tenancy).toEqual({ organizationId: '17' });
        expect(t.calls.credentialUserId).toEqual(['17']);
    });

    it('is the default for an organization-primary app that sets nothing', async () => {
        const t = build();
        await authorize(t, caller({ org: 17, primary: 'organization' }));
        expect(t.moduleRepository.createEntity.mock.calls[0][0].user).toBe('17');
    });

    it('400s with no active organization, and does not create anything', async () => {
        const t = build({ registry });
        await expect(authorize(t, caller())).rejects.toMatchObject({
            output: { statusCode: 400 },
            data: { code: 'IDENTITY_REQUIRED', details: { field: 'x-frigg-apporgid' } },
        });
        expect(t.moduleRepository.createEntity).not.toHaveBeenCalled();
    });
});

describe('authorizing an organization entity needs an organization admin', () => {
    const registry = new Map([['acme', { settings: { scope: 'organization' } }]]);

    it.each([
        ['a member', { source: 'adopter-jwt', role: 'MEMBER' }, undefined],
        ['a token with no role claim', { source: 'adopter-jwt' }, undefined],
        ['a bearer token, once the app gates them', { source: 'bearer-token' }, { gateBearerTokens: true }],
    ])('refuses %s with 403 and creates nothing', async (_name, options, ownership) => {
        const t = build({ registry, ownership });
        await expect(authorize(t, caller({ org: 17, ...options }))).rejects.toMatchObject({
            output: { statusCode: 403 },
            data: { code: 'ORG_ADMIN_REQUIRED' },
        });
        expect(t.moduleRepository.createEntity).not.toHaveBeenCalled();
    });

    it('lets an admin token, a shared-secret caller and (by default) a bearer token connect it', async () => {
        for (const options of [{ source: 'adopter-jwt', role: 'ADMIN' }, {}, { source: 'bearer-token' }]) {
            const t = build({ registry });
            await authorize(t, caller({ org: 17, ...options }));
            expect(t.moduleRepository.createEntity.mock.calls[0][0].user).toBe('17');
        }
    });

    it('a member still connects their own individual account', async () => {
        const t = build();
        await authorize(t, caller({ org: 17, source: 'adopter-jwt', role: 'MEMBER' }));
        expect(t.moduleRepository.createEntity.mock.calls[0][0].user).toBe('7');
    });

    it('the configured admin roles replace ADMIN', async () => {
        const ownership = { scope: 'organization', orgAdminRoles: ['OWNER'] };
        const owner = build({ registry, ownership });
        await authorize(owner, caller({ org: 17, source: 'adopter-jwt', role: 'owner' }));
        expect(owner.moduleRepository.createEntity).toHaveBeenCalled();
        const admin = build({ registry, ownership });
        await expect(authorize(admin, caller({ org: 17, source: 'adopter-jwt', role: 'ADMIN' }))).rejects.toMatchObject({
            output: { statusCode: 403 },
        });
    });
});

describe('the scope a request may choose', () => {
    const registry = new Map([
        ['acme', { settings: { scope: { default: 'organization', allow: ['organization', 'individual'] } } }],
    ]);

    it('takes the request scope when the type allows it', async () => {
        const t = build({ registry });
        await authorize(t, caller({ org: 17 }), { scope: 'individual' });
        expect(t.moduleRepository.createEntity.mock.calls[0][0].user).toBe('7');
    });

    it('refuses a scope the type does not allow, and global always', async () => {
        const strict = build({ registry: new Map([['acme', { settings: { scope: 'individual' } }]]) });
        await expect(authorize(strict, caller({ org: 17 }), { scope: 'organization' })).rejects.toMatchObject({
            output: { statusCode: 403 },
            data: { code: 'SCOPE_NOT_ALLOWED' },
        });
        const t = build({ registry });
        await expect(authorize(t, caller({ org: 17 }), { scope: 'global' })).rejects.toMatchObject({
            output: { statusCode: 403 },
            data: { code: 'SCOPE_NOT_ALLOWED' },
        });
        expect(t.moduleRepository.createEntity).not.toHaveBeenCalled();
    });

    it('a global type cannot be created through the tenant API: refused with a clear error', async () => {
        const t = build({ registry: new Map([['acme', { settings: { scope: 'global' } }]]) });
        await expect(authorize(t, caller({ org: 17 }))).rejects.toMatchObject({
            output: { statusCode: 403 },
            message: expect.stringMatching(/app owner through admin routes/),
        });
        expect(t.moduleRepository.createEntity).not.toHaveBeenCalled();
    });
});

describe('re-authorizing finds the entity of the same organization', () => {
    const existingIn = (organizationId, id = 'old') => ({
        id,
        userId: '7',
        organizationId,
        moduleName: 'acme',
        externalId: 'acct-1',
        credential: { id: 'cred-1' },
    });

    it('reuses the entity connected in this organization, and not the one from another', async () => {
        const t = build({ existing: [existingIn('18', 'in18'), existingIn('17', 'in17')] });
        const result = await authorize(t, caller({ org: 17 }));
        expect(t.moduleRepository.createEntity).not.toHaveBeenCalled();
        expect(result.entity.id).toBe('in17');
    });

    it('creates a new entity when the account was only connected in another organization', async () => {
        const t = build({ existing: [existingIn('18')] });
        await authorize(t, caller({ org: 17 }));
        expect(t.moduleRepository.createEntity).toHaveBeenCalledTimes(1);
    });

    it('reuses a legacy unscoped entity in the legacy organization of the person', async () => {
        const t = build({ existing: [existingIn(null)] });
        const result = await authorize(t, caller({ individual: { id: '7', organizationId: '17' }, org: 17 }));
        expect(t.moduleRepository.createEntity).not.toHaveBeenCalled();
        expect(result.entity.id).toBe('old');
    });

    it('does not reuse a legacy unscoped entity in a second organization', async () => {
        const t = build({ existing: [existingIn(null)] });
        await authorize(t, caller({ individual: { id: '7', organizationId: '99' }, org: 17 }));
        expect(t.moduleRepository.createEntity).toHaveBeenCalledTimes(1);
    });

    it('asks the repository for the owner and the account; the organization is picked from the rows', async () => {
        const t = build({ existing: [] });
        await authorize(t, caller({ org: 17 }));
        expect(t.moduleRepository.findEntities).toHaveBeenCalledWith({
            externalId: 'acct-1',
            user: '7',
            moduleName: 'acme',
        });
    });
});

describe('a callback with no tenancy means the person own, outside any organization', () => {
    it('looks up and creates with the default tenancy', async () => {
        const t = build();
        await t.processAuthorizationCallback.execute('u1', 'acme', { api_key: 'k' });
        expect(t.moduleRepository.findEntities).toHaveBeenCalled();
        expect(t.moduleRepository.createEntity.mock.calls[0][1]).toEqual({ organizationId: null });
    });
});
