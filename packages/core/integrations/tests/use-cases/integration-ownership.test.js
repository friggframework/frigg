jest.mock('../../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
}));

/**
 * Who owns an integration, which entities its creator may bind, and who may
 * see and change it (ADR-056 §3, §3.3, §3.6). The scope rules are real; the
 * repositories answer the way a database does.
 */
const { User } = require('../../../user/user');
const { createScopePolicy } = require('../../../modules/scope-policy');
const { ResolveIntegrationOwnership } = require('../../use-cases/resolve-integration-ownership');
const { CreateIntegration } = require('../../use-cases/create-integration');
const { GetIntegrationsForUser } = require('../../use-cases/get-integrations-for-user');
const {
    GetOwnedIntegrationRecord,
    CreateIntegrationForUser,
    UpdateIntegrationForUser,
    RemoveIntegrationForUser,
} = require('../../use-cases/integration-operations-for-user');
const { TestIntegrationRepository } = require('../doubles/test-integration-repository');
const { TestModuleFactory } = require('../../../modules/tests/doubles/test-module-factory');
const { DummyIntegration } = require('../doubles/dummy-integration-class');

const caller = ({ individual = { id: '7', organizationId: null }, org = null, source = 'shared-secret', role } = {}) => {
    const user = new User(individual, org ? { id: String(org) } : null, false, 'individual', true, false);
    user.setAuthSource(source);
    if (role) user.setOrgRole(role);
    return user;
};

const entity = (id, userId, organizationId, moduleName = 'crm') => ({
    id,
    userId: userId === null ? undefined : String(userId),
    organizationId: organizationId === null ? null : String(organizationId),
    moduleName,
});

const definitionFor = (moduleName) => ({ moduleName, getName: () => moduleName });
const integrationClass = (Definition) => ({ Definition: { name: 'sync', ...Definition } });

function resolver({ entities, integrationClasses, ownership, registry } = {}) {
    const moduleRepository = {
        findEntitiesByIds: jest.fn(async (ids) => entities.filter((e) => ids.includes(e.id))),
    };
    return new ResolveIntegrationOwnership({
        moduleRepository,
        integrationClasses: integrationClasses ?? [integrationClass({})],
        scopePolicy: createScopePolicy({ ownership, entityTypeRegistry: registry }),
    });
}

const resolve = (r, ids, user, type = 'sync') => r.execute({ entityIds: ids, config: { type }, user });

describe('ResolveIntegrationOwnership: the owner follows the entity scopes', () => {
    const entities = [
        entity('mine', 7, 17), // person 7's, connected in 17
        entity('org', 17, 17), // organization 17's
        entity('elsewhere', 7, 18), // person 7's, connected in 18
        entity('theirs', 8, 17), // a colleague's
        entity('global', null, null),
    ];

    it('all individual: the person, in the active organization', async () => {
        expect(await resolve(resolver({ entities }), ['mine'], caller({ org: 17 }))).toMatchObject({
            ownerId: '7',
            organizationId: '17',
            ownerKind: 'individual',
        });
    });

    it('all organization: the organization user', async () => {
        expect(await resolve(resolver({ entities }), ['org'], caller({ org: 17 }))).toMatchObject({
            ownerId: '17',
            organizationId: '17',
            ownerKind: 'organization',
        });
    });

    it('refuses a mixed integration before anything is written: 400 naming the entity', async () => {
        // Derived as the person's, but the integration is loaded by its owner, who must own what it uses.
        await expect(resolve(resolver({ entities }), ['org', 'mine'], caller({ org: 17 }))).rejects.toMatchObject({
            output: { statusCode: 400 },
            data: { code: 'MIXED_ENTITY_SCOPES', details: { entityId: 'org', scope: 'organization' } },
        });
        await expect(resolve(resolver({ entities }), ['mine', 'org'], caller({ org: 17 }))).rejects.toMatchObject({
            data: { code: 'MIXED_ENTITY_SCOPES' },
        });
    });

    it('404s a global entity: it is not the tenant\'s to bind', async () => {
        await expect(resolve(resolver({ entities }), ['global'], caller({ org: 17 }))).rejects.toMatchObject({
            output: { statusCode: 404 },
            data: { code: 'ENTITY_NOT_FOUND' },
        });
    });

    it('404s an entity that belongs to another organization, a colleague, or nobody, the same as a missing one', async () => {
        for (const id of ['elsewhere', 'theirs', 'missing']) {
            await expect(resolve(resolver({ entities }), [id], caller({ org: 17 }))).rejects.toMatchObject({
                output: { statusCode: 404 },
                data: { code: 'ENTITY_NOT_FOUND' },
            });
        }
    });

    it('without an organization an organization entity is not even visible', async () => {
        await expect(resolve(resolver({ entities }), ['org'], caller())).rejects.toMatchObject({
            output: { statusCode: 404 },
        });
    });

    it('tells the caller whether an unscoped integration is theirs to reuse', async () => {
        const noOrg = await resolve(resolver({ entities: [entity('mine', 7, null)] }), ['mine'], caller());
        expect(noOrg.adoptUnscoped).toBe(true);
        const other = await resolve(resolver({ entities }), ['mine'], caller({ individual: { id: '7', organizationId: '99' }, org: 17 }));
        expect(other.adoptUnscoped).toBe(false);
        const legacyOrg = await resolve(resolver({ entities }), ['mine'], caller({ individual: { id: '7', organizationId: '17' }, org: 17 }));
        expect(legacyOrg.adoptUnscoped).toBe(true);
    });
});

describe('ResolveIntegrationOwnership: what the integration declares', () => {
    const entities = [entity('mine', 7, 17), entity('org', 17, 17)];
    const bound = (setting) =>
        integrationClass({ modules: { crm: { definition: definitionFor('crm'), ...setting } } });

    it("refuses an entity whose scope the binding does not accept, naming both", async () => {
        const r = resolver({ entities, integrationClasses: [bound({ scope: 'organization' })] });
        await expect(resolve(r, ['mine'], caller({ org: 17 }))).rejects.toMatchObject({
            output: { statusCode: 400 },
            data: { code: 'ENTITY_SCOPE_MISMATCH', details: { scope: 'individual', allowed: ['organization'] } },
        });
        expect((await resolve(r, ['org'], caller({ org: 17 }))).ownerKind).toBe('organization');
    });

    it('accepts either scope when the binding allows both', async () => {
        const r = resolver({
            entities,
            integrationClasses: [bound({ scope: { default: 'individual', allow: ['individual', 'organization'] } })],
        });
        await expect(resolve(r, ['mine'], caller({ org: 17 }))).resolves.toBeDefined();
        await expect(resolve(r, ['org'], caller({ org: 17 }))).resolves.toBeDefined();
    });

    it('reads Definition.entities[key].scope as the binding scope', async () => {
        const r = resolver({
            entities,
            integrationClasses: [
                integrationClass({
                    modules: { crm: { definition: definitionFor('crm') } },
                    entities: { crm: { scope: 'organization' } },
                }),
            ],
        });
        await expect(resolve(r, ['mine'], caller({ org: 17 }))).rejects.toMatchObject({
            data: { code: 'ENTITY_SCOPE_MISMATCH' },
        });
    });

    it('reads Definition.ownership.scope for every binding that sets none', async () => {
        const r = resolver({
            entities,
            integrationClasses: [
                integrationClass({
                    modules: { crm: { definition: definitionFor('crm') } },
                    ownership: { scope: 'individual' },
                }),
            ],
        });
        await expect(resolve(r, ['org'], caller({ org: 17 }))).rejects.toMatchObject({
            data: { code: 'ENTITY_SCOPE_MISMATCH' },
        });
    });

    it('does not restrict what an integration may bind by the registry or app level: those decide where a connection is created', async () => {
        const registry = new Map([['crm', { settings: { scope: 'organization' } }]]);
        const r = resolver({
            entities,
            registry,
            ownership: { scope: 'organization' },
            integrationClasses: [bound({})],
        });
        // The existing individual connection still binds, so adding a registry scope later breaks nothing.
        await expect(resolve(r, ['mine'], caller({ org: 17 }))).resolves.toMatchObject({ ownerKind: 'individual' });
    });

    it("honours an explicit owner: 'organization' and refuses it with an individual entity", async () => {
        const r = resolver({
            entities,
            integrationClasses: [
                integrationClass({
                    modules: { crm: { definition: definitionFor('crm') } },
                    ownership: { owner: 'organization' },
                }),
            ],
        });
        expect((await resolve(r, ['org'], caller({ org: 17 }))).ownerId).toBe('17');
        await expect(resolve(r, ['mine'], caller({ org: 17 }))).rejects.toMatchObject({
            output: { statusCode: 400 },
            data: { code: 'ORG_INTEGRATION_INDIVIDUAL_ENTITY' },
        });
    });

    it("refuses an explicit owner: 'individual' over organization entities, as the owner could not load them", async () => {
        const r = resolver({
            entities,
            integrationClasses: [
                integrationClass({
                    modules: { crm: { definition: definitionFor('crm') } },
                    ownership: { owner: 'individual' },
                }),
            ],
        });
        await expect(resolve(r, ['org'], caller({ org: 17 }))).rejects.toMatchObject({
            output: { statusCode: 400 },
            data: { code: 'MIXED_ENTITY_SCOPES' },
        });
    });
});

describe('CreateIntegration reuses a duplicate only within one organization', () => {
    let repository;
    let create;
    beforeEach(() => {
        repository = new TestIntegrationRepository();
        create = new CreateIntegration({
            integrationRepository: repository,
            integrationClasses: [DummyIntegration],
            moduleFactory: new TestModuleFactory(),
        });
    });
    const run = (orgId, extra = {}) =>
        create.execute(['e1'], '7', { type: 'dummy' }, { organizationId: orgId, ...extra });

    it('stores the organization it is created in', async () => {
        await run('17');
        expect([...repository.store.values()][0].organizationId).toBe('17');
    });

    it('does not hand organization 17 integration back as the one asked for in 18', async () => {
        const first = await run('17');
        const second = await run('18');
        expect(second.id).not.toBe(first.id);
        expect(repository.store.size).toBe(2);
    });

    it('reuses it in the same organization', async () => {
        const first = await run('17');
        const again = await run('17');
        expect(again.id).toBe(first.id);
        expect(repository.store.size).toBe(1);
    });

    it('reuses a row written before scoping only where it belongs (adoptUnscoped)', async () => {
        const legacy = await repository.createIntegration(['e1'], '7', { type: 'dummy' });
        const refused = await run('17', { adoptUnscoped: false });
        expect(refused.id).not.toBe(legacy.id);
        repository.store.delete(refused.id);
        const adopted = await run('17', { adoptUnscoped: true });
        expect(adopted.id).toBe(legacy.id);
    });

    it('with no organization, an unscoped row is the duplicate', async () => {
        const legacy = await repository.createIntegration(['e1'], '7', { type: 'dummy' });
        expect((await run(null)).id).toBe(legacy.id);
    });
});

describe('listing and reaching integrations by organization', () => {
    let repository;
    let moduleRepository;
    const seed = async () => {
        repository = new TestIntegrationRepository();
        moduleRepository = {
            findEntitiesByIds: jest.fn(async (ids) => ids.map((id) => ({ id }))),
        };
        const make = (userId, orgId, name) =>
            repository.createIntegration(['e1'], userId, { type: 'dummy', name }, { organizationId: orgId });
        return {
            mine17: await make('7', '17', 'mine17'),
            mine18: await make('7', '18', 'mine18'),
            org17: await make('17', '17', 'org17'),
            org18: await make('18', '18', 'org18'),
            theirs17: await make('8', '17', 'theirs17'),
            legacy: await repository.createIntegration(['e1'], '7', { type: 'dummy', name: 'legacy' }),
        };
    };
    const lister = (policy) =>
        new GetIntegrationsForUser({
            integrationRepository: repository,
            integrationClasses: [DummyIntegration],
            moduleFactory: new TestModuleFactory(),
            moduleRepository,
            scopePolicy: policy,
        });
    const names = (list) => list.map((i) => i.config.name).sort();

    it("lists the caller's and the active organization's integrations in that organization only", async () => {
        await seed();
        expect(names(await lister().execute(caller({ org: 17 })))).toEqual(['mine17', 'org17']);
        expect(names(await lister().execute(caller({ org: 18 })))).toEqual(['mine18', 'org18']);
    });

    it('asks for owner/organization pairs, in one query', async () => {
        await seed();
        await lister().execute(caller({ org: 17 }));
        const asked = repository.operationHistory.filter((op) => op.operation === 'findByOwnership');
        expect(asked).toHaveLength(1);
        expect(asked[0].clauses).toEqual([
            { userId: '17', organizationId: '17' },
            { userId: '17', organizationId: null },
            { userId: '7', organizationId: '17' },
        ]);
    });

    it('does not widen the list if a repository returns more than it was asked for', async () => {
        await seed();
        repository.findIntegrationsByOwnership = async () => [...repository.store.values()];
        expect(names(await lister().execute(caller({ org: 17 })))).toEqual(['mine17', 'org17']);
    });

    it('carries scope, owner, organizationId and access on each row', async () => {
        await seed();
        const list = await lister().execute(caller({ org: 17 }));
        const byName = Object.fromEntries(list.map((i) => [i.config.name, i.tenancy]));
        expect(byName.mine17).toEqual({
            scope: 'individual', owner: { type: 'individual', id: '7' }, organizationId: '17', access: 'manage',
        });
        expect(byName.org17).toEqual({
            scope: 'organization', owner: { type: 'organization', id: '17' }, organizationId: '17', access: 'manage',
        });
    });

    it('legacy rows (no organization) keep showing: with no organization, and in the legacy organization', async () => {
        await seed();
        expect(names(await lister().execute(caller()))).toEqual(['legacy']);
        expect(names(await lister().execute(caller({ individual: { id: '7', organizationId: '17' }, org: 17 })))).toEqual([
            'legacy', 'mine17', 'org17',
        ]);
        // A second organization does not get them.
        expect(names(await lister().execute(caller({ individual: { id: '7', organizationId: '17' }, org: 18 })))).toEqual([
            'mine18', 'org18',
        ]);
    });

    it("'all' does not lift an integration out of its organization", async () => {
        await seed();
        const policy = createScopePolicy({ ownership: { individualAcross: 'all' } });
        expect(names(await lister(policy).execute(caller({ org: 17 })))).toEqual(['mine17', 'org17']);
    });

    it('filters ?owner and ?scope', async () => {
        await seed();
        expect(names(await lister().execute(caller({ org: 17 }), { owner: 'org' }))).toEqual(['org17']);
        expect(names(await lister().execute(caller({ org: 17 }), { scope: 'individual' }))).toEqual(['mine17']);
    });

    describe('reaching one', () => {
        it('404s another organization integration, a colleague one, and a missing one', async () => {
            const rows = await seed();
            const get = new GetOwnedIntegrationRecord({ integrationRepository: repository });
            for (const id of [rows.mine18.id, rows.org18.id, rows.theirs17.id, 'nope']) {
                await expect(get.execute(id, caller({ org: 17 }))).rejects.toMatchObject({ output: { statusCode: 404 } });
            }
            await expect(get.execute(rows.org17.id, caller({ org: 17 }))).resolves.toMatchObject({ id: rows.org17.id });
        });
    });
});

describe('a missing integration is a 404; other failures are not', () => {
    const { integrationNotFoundError, isIntegrationNotFound } = require('../../repositories/integration-not-found');
    const getOwned = (error) =>
        new GetOwnedIntegrationRecord({
            integrationRepository: { findIntegrationById: jest.fn().mockRejectedValue(error) },
        });

    it('maps the exact error the repositories throw for a missing id', async () => {
        await expect(getOwned(integrationNotFoundError('i9')).execute('i9', caller())).rejects.toMatchObject({
            output: { statusCode: 404 },
            data: { code: 'INTEGRATION_NOT_FOUND' },
        });
    });

    it('does not turn any other "not found" into a 404: a database fault that mentions it stays a fault', async () => {
        for (const message of ['Entity 5 not found', 'Integration with id 5 not found in shard 2', 'connection not found']) {
            const error = new Error(message);
            await expect(getOwned(error).execute('5', caller())).rejects.toBe(error);
        }
    });

    it('recognises only its own message', () => {
        expect(isIntegrationNotFound(integrationNotFoundError('x'))).toBe(true);
        expect(isIntegrationNotFound(new Error('Integration with id x not found in shard'))).toBe(false);
        expect(isIntegrationNotFound(undefined)).toBe(false);
    });
});

describe('CreateIntegrationForUser stores the owner and organization the rule decided', () => {
    it('creates through the shared create with the resolved owner, organization and adoption flag', async () => {
        const entities = [entity('mine', 7, 17)];
        const createIntegration = { execute: jest.fn().mockResolvedValue({ id: 'new' }) };
        const classes = [integrationClass({})];
        const useCase = new CreateIntegrationForUser({
            createIntegration,
            resolveIntegrationOwnership: resolver({ entities, integrationClasses: classes }),
            integrationClasses: classes,
        });
        await useCase.execute({ entities: ['mine'], config: { type: 'sync' } }, caller({ org: 17 }));
        expect(createIntegration.execute).toHaveBeenCalledWith(['mine'], '7', { type: 'sync' }, {
            organizationId: '17',
            adoptUnscoped: false,
        });
    });
});

describe('creating twice is idempotent for a legacy organization-owned integration', () => {
    // Written before scoping by an organization-primary app: owner = the organization, no organizationId.
    const setup = async () => {
        const repository = new TestIntegrationRepository();
        const legacy = await repository.createIntegration(['x'], '17', { type: 'dummy' });
        const classes = [DummyIntegration];
        const moduleRepository = {
            findEntitiesByIds: jest.fn(async () => [entity('x', 17, null, 'dummy')]),
        };
        const useCase = new CreateIntegrationForUser({
            createIntegration: new CreateIntegration({
                integrationRepository: repository,
                integrationClasses: classes,
                moduleFactory: new TestModuleFactory(),
            }),
            resolveIntegrationOwnership: new ResolveIntegrationOwnership({ moduleRepository, integrationClasses: classes }),
            integrationClasses: classes,
        });
        return { repository, legacy, useCase };
    };
    const create = (useCase, user) =>
        useCase.execute({ entities: ['x'], config: { type: 'dummy' } }, user);
    const orgUser = (individual) => {
        const user = new User(individual, { id: '17' }, false, 'organization', false, true);
        user.setAuthSource('shared-secret');
        return user;
    };

    it('reuses it when the caller sends only the organization (x-frigg-apporgid)', async () => {
        const { repository, legacy, useCase } = await setup();
        const result = await create(useCase, orgUser(null));
        expect(result.id).toBe(legacy.id);
        expect(repository.store.size).toBe(1);
        expect(repository.operationHistory.filter((op) => op.operation === 'create')).toHaveLength(1);
    });

    it("reuses it when the person's legacy pointer names a different organization", async () => {
        const { repository, legacy, useCase } = await setup();
        const result = await create(useCase, orgUser({ id: '7', organizationId: '99' }));
        expect(result.id).toBe(legacy.id);
        expect(repository.store.size).toBe(1);
    });

    it('reuses it when the pointer names the organization, and twice in a row', async () => {
        const { repository, legacy, useCase } = await setup();
        const user = orgUser({ id: '7', organizationId: '17' });
        expect((await create(useCase, user)).id).toBe(legacy.id);
        expect((await create(useCase, user)).id).toBe(legacy.id);
        expect(repository.store.size).toBe(1);
    });

    it('tells the creator to adopt unscoped rows whenever the owner is the organization', async () => {
        const { repository } = await setup();
        const moduleRepository = { findEntitiesByIds: async () => [entity('x', 17, null, 'dummy')] };
        const resolved = await new ResolveIntegrationOwnership({
            moduleRepository,
            integrationClasses: [DummyIntegration],
        }).execute({ entityIds: ['x'], config: { type: 'dummy' }, user: orgUser({ id: '7', organizationId: '99' }) });
        expect(resolved).toMatchObject({ ownerKind: 'organization', ownerId: '17', adoptUnscoped: true });
        expect(repository.store.size).toBe(1);
    });
});

describe('CreateIntegration refuses before it persists: no orphan IN_CREATION rows', () => {
    const build = (moduleFactory = new TestModuleFactory()) => {
        const repository = new TestIntegrationRepository();
        return {
            repository,
            create: new CreateIntegration({
                integrationRepository: repository,
                integrationClasses: [DummyIntegration],
                moduleFactory,
            }),
        };
    };

    it('an unknown integration type leaves nothing behind', async () => {
        const { repository, create } = build();
        await expect(create.execute(['e1'], '7', { type: 'nope' })).rejects.toThrow(/No integration class found/);
        expect(repository.store.size).toBe(0);
    });

    it('an entity its owner cannot load leaves nothing behind', async () => {
        const { repository, create } = build({
            getModuleInstance: async (id) => {
                throw new Error(`Entity ${id} does not belong to user 7`);
            },
        });
        await expect(create.execute(['e1'], '7', { type: 'dummy' })).rejects.toThrow(/does not belong/);
        expect(repository.store.size).toBe(0);
        expect(repository.operationHistory.some((op) => op.operation === 'create')).toBe(false);
    });
});

describe('organization roles: a member uses an organization integration, an admin manages it', () => {
    const member = { org: 17, source: 'adopter-jwt', role: 'MEMBER' };
    const admin = { org: 17, source: 'adopter-jwt', role: 'ADMIN' };
    const noRole = { org: 17, source: 'adopter-jwt' };
    const entities = [entity('mine', 7, 17), entity('org', 17, 17)];

    it('creating an organization integration needs an admin (403 ORG_ADMIN_REQUIRED)', async () => {
        const r = resolver({ entities });
        for (const options of [member, noRole]) {
            await expect(resolve(r, ['org'], caller(options))).rejects.toMatchObject({
                output: { statusCode: 403 },
                data: { code: 'ORG_ADMIN_REQUIRED' },
            });
        }
        expect(await resolve(r, ['org'], caller(admin))).toMatchObject({ ownerId: '17', ownerKind: 'organization' });
        expect(await resolve(r, ['org'], caller({ org: 17 }))).toMatchObject({ ownerId: '17' });
    });

    it("a member's own integration is theirs to create whatever their role", async () => {
        expect(await resolve(resolver({ entities }), ['mine'], caller(member))).toMatchObject({
            ownerId: '7',
            ownerKind: 'individual',
        });
    });

    describe('changing and deleting', () => {
        let repository;
        let rows;
        const build = async () => {
            repository = new TestIntegrationRepository();
            const make = (userId, name) =>
                repository.createIntegration(['e1'], userId, { type: 'dummy', name }, { organizationId: '17' });
            rows = { org: await make('17', 'org'), mine: await make('7', 'mine') };
            const getOwnedIntegrationRecord = new GetOwnedIntegrationRecord({ integrationRepository: repository });
            const updateIntegration = { execute: jest.fn(async () => ({ ok: true })) };
            const deleteIntegrationForUser = { execute: jest.fn() };
            return {
                get: getOwnedIntegrationRecord,
                updateIntegration,
                deleteIntegrationForUser,
                update: new UpdateIntegrationForUser({ getOwnedIntegrationRecord, updateIntegration }),
                remove: new RemoveIntegrationForUser({ getOwnedIntegrationRecord, deleteIntegrationForUser }),
            };
        };

        it('a member may read it but not PATCH or DELETE it, and nothing is written', async () => {
            const t = await build();
            await expect(t.get.execute(rows.org.id, caller(member))).resolves.toMatchObject({ id: rows.org.id });
            const refused = { output: { statusCode: 403 }, data: { code: 'ORG_ADMIN_REQUIRED' } };
            await expect(t.update.execute(rows.org.id, caller(member), { name: 'x' })).rejects.toMatchObject(refused);
            await expect(t.remove.execute(rows.org.id, caller(member))).rejects.toMatchObject(refused);
            await expect(t.remove.execute(rows.org.id, caller(noRole))).rejects.toMatchObject(refused);
            expect(t.updateIntegration.execute).not.toHaveBeenCalled();
            expect(t.deleteIntegrationForUser.execute).not.toHaveBeenCalled();
        });

        it('an admin may; so may a shared-secret caller', async () => {
            const t = await build();
            await t.update.execute(rows.org.id, caller(admin), { name: 'x' });
            await t.remove.execute(rows.org.id, caller({ org: 17 }));
            expect(t.updateIntegration.execute).toHaveBeenCalledTimes(1);
            expect(t.deleteIntegrationForUser.execute).toHaveBeenCalledTimes(1);
        });

        it("a member manages their own integration, and an unreachable one is still a 404, not a 403", async () => {
            const t = await build();
            await t.remove.execute(rows.mine.id, caller(member));
            expect(t.deleteIntegrationForUser.execute).toHaveBeenCalledTimes(1);
            await expect(t.remove.execute('nope', caller(member))).rejects.toMatchObject({ output: { statusCode: 404 } });
        });
    });
});
