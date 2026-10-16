/**
 * The scope rules over in-memory repositories that answer the way a database
 * does (they run the clauses they are handed), with the real `User`. Where a
 * test needs the request shape it asserts the clauses sent, not the rows
 * returned: a double that returns what the code wants cannot catch a query
 * that does not filter.
 */
jest.mock('../../module', () => ({
    // Building a Module needs a real API definition; the rules under test run before it.
    Module: jest.fn(function Module(params) {
        Object.assign(this, params);
    }),
}));
jest.mock('../../utils/map-module-dto', () => ({
    mapModuleClassToModuleDTO: (module) => ({ id: module.entity.id }),
}));

const { User } = require('../../../user/user');
const { matchesAnyClause } = require('../../tests/doubles/ownership-matching');
const { GetEntityModuleForUser } = require('../get-entity-module-for-user');
const {
    ListEntitiesForUser,
    GetEntityForUser,
    DeleteEntityForUser,
} = require('../entity-operations-for-user');
const { GetModule } = require('../get-module');
const { GetEntitiesForUser } = require('../get-entities-for-user');
const { createScopePolicy } = require('../../scope-policy');

function fakeRepos({ entities = [], integrations = [] } = {}) {
    const moduleRepository = {
        findEntitiesByOwnership: jest.fn(async (clauses) =>
            entities.filter((row) => matchesAnyClause(row, clauses))
        ),
        findEntityById: jest.fn(async (id) => {
            const row = entities.find((e) => String(e.id) === String(id));
            if (!row) throw new Error(`Entity ${id} not found`);
            return row;
        }),
        deleteEntity: jest.fn(),
    };
    const integrationRepository = {
        findIntegrationsByEntityId: jest.fn(async () => integrations),
    };
    return { moduleRepository, integrationRepository };
}

// Person 7 belongs to organizations 17 (the legacy pointer) and 18. Person 8 is in 17.
const person = (id, pointer = null) => ({ id: String(id), type: 'INDIVIDUAL', organizationId: pointer });
const orgUser = (id) => ({ id: String(id), type: 'ORGANIZATION' });
const callerIn = (individual, org, { primary = 'individual', source = 'shared-secret', role } = {}) => {
    const user = new User(individual, org ? orgUser(org) : null, false, primary, true, false);
    user.setAuthSource(source);
    if (role) user.setOrgRole(role);
    return user;
};

const entity = (id, userId, organizationId, extra = {}) => ({
    id: String(id),
    userId: String(userId),
    organizationId: organizationId === null ? null : String(organizationId),
    moduleName: 'acme',
    credential: extra.credential ? { id: extra.credential } : null,
    ...extra,
});

describe('entities are listed and loaded per active organization', () => {
    const rows = [
        entity('g17', 7, 17), // 7's Google, connected in 17
        entity('g18', 7, 18), // the same person's Google, connected in 18
        entity('x17', 17, 17), // organization 17's own
        entity('x18', 18, 18), // organization 18's own
        entity('h17', 8, 17), // a colleague's, in 17
        entity('global', null, null), // the app owner's
    ];
    const ids = (list) => list.map((e) => e.id).sort();

    it('lists the active organization entities and the caller individual ones, never another organization', async () => {
        const repos = fakeRepos({ entities: rows });
        const list = new ListEntitiesForUser({ moduleRepository: repos.moduleRepository });
        const inSeventeen = await list.execute(callerIn(person(7, 17), 17));
        expect(ids(inSeventeen)).toEqual(['g17', 'x17']);
        const inEighteen = await list.execute(callerIn(person(7, 17), 18));
        expect(ids(inEighteen)).toEqual(['g18', 'x18']);
    });

    it('carries scope, owner, organizationId and access on every row', async () => {
        const repos = fakeRepos({ entities: rows });
        const list = new ListEntitiesForUser({ moduleRepository: repos.moduleRepository });
        const result = await list.execute(callerIn(person(7, 17), 17));
        expect(Object.fromEntries(result.map((e) => [e.id, e.tenancy]))).toEqual({
            g17: { scope: 'individual', owner: { type: 'individual', id: '7' }, organizationId: '17', access: 'manage' },
            x17: { scope: 'organization', owner: { type: 'organization', id: '17' }, organizationId: '17', access: 'manage' },
        });
    });

    it('sends the owner/organization pairs, not a bare user id', async () => {
        const repos = fakeRepos({ entities: rows });
        await new ListEntitiesForUser({ moduleRepository: repos.moduleRepository }).execute(callerIn(person(7, 17), 17));
        expect(repos.moduleRepository.findEntitiesByOwnership).toHaveBeenCalledTimes(1);
        expect(repos.moduleRepository.findEntitiesByOwnership).toHaveBeenCalledWith([
            { userId: '17', organizationId: '17' },
            { userId: '17', organizationId: null },
            { userId: '7', organizationId: '17' },
            { userId: '7', organizationId: null }, // person 7's legacy pointer is 17
        ]);
    });

    it('does not widen the list if a repository returns more than it was asked for', async () => {
        const repos = fakeRepos({ entities: rows });
        repos.moduleRepository.findEntitiesByOwnership = jest.fn(async () => rows);
        const list = new ListEntitiesForUser({ moduleRepository: repos.moduleRepository });
        expect(ids(await list.execute(callerIn(person(7), 17)))).toEqual(['g17', 'x17']);
    });

    it('filters ?scope and ?owner', async () => {
        const repos = fakeRepos({ entities: rows });
        const list = new ListEntitiesForUser({ moduleRepository: repos.moduleRepository });
        const caller = callerIn(person(7), 17);
        expect(ids(await list.execute(caller, { scope: 'organization' }))).toEqual(['x17']);
        expect(ids(await list.execute(caller, { owner: 'me' }))).toEqual(['g17']);
        expect(ids(await list.execute(caller, { owner: 'org', scope: 'individual' }))).toEqual([]);
    });

    it("'all' lists the caller organization-independent entities in every organization", async () => {
        const all = [entity('u7', 7, null), entity('u8', 8, null), entity('x17', 17, 17), entity('x18', 18, 18)];
        const repos = fakeRepos({ entities: all });
        const policy = createScopePolicy({ ownership: { individualAcross: 'all' } });
        const list = new ListEntitiesForUser({ moduleRepository: repos.moduleRepository, scopePolicy: policy });
        expect(ids(await list.execute(callerIn(person(7), 17)))).toEqual(['u7', 'x17']);
        expect(ids(await list.execute(callerIn(person(7), 18)))).toEqual(['u7', 'x18']);
        // Without 'all' the same rows are not the caller's in either organization.
        const strict = new ListEntitiesForUser({ moduleRepository: repos.moduleRepository });
        expect(ids(await strict.execute(callerIn(person(7), 17)))).toEqual(['x17']);
    });

    describe('loading one entity for use (proxy, test-auth, options)', () => {
        const load = (id, caller, policy) =>
            new GetEntityModuleForUser({
                moduleRepository: fakeRepos({ entities: rows }).moduleRepository,
                moduleDefinitions: [{ moduleName: 'acme' }],
                scopePolicy: policy,
            }).loadOwnedEntity(id, caller);

        it('loads the caller entity in the organization it was connected in', async () => {
            expect((await load('g17', callerIn(person(7), 17))).id).toBe('g17');
        });

        it('404s the same entity from another organization: connected in 17 is unusable in 18', async () => {
            await expect(load('g17', callerIn(person(7), 18))).rejects.toMatchObject({
                output: { statusCode: 404 },
                data: { code: 'ENTITY_NOT_FOUND' },
            });
        });

        it('404s a colleague entity, another organization entity and a global one', async () => {
            for (const id of ['h17', 'x18', 'global']) {
                await expect(load(id, callerIn(person(7), 17))).rejects.toMatchObject({
                    output: { statusCode: 404 },
                });
            }
        });

        it('loads the organization entity for any member of it', async () => {
            expect((await load('x17', callerIn(person(8), 17))).id).toBe('x17');
            await expect(load('x17', callerIn(person(8), 18))).rejects.toMatchObject({ output: { statusCode: 404 } });
        });

        it("'all' makes an organization-independent entity usable in every organization", async () => {
            const repos = fakeRepos({ entities: [entity('u7', 7, null)] });
            const loader = (caller, policy) =>
                new GetEntityModuleForUser({
                    moduleRepository: repos.moduleRepository,
                    moduleDefinitions: [],
                    scopePolicy: policy,
                }).loadOwnedEntity('u7', caller);
            const all = createScopePolicy({ ownership: { individualAcross: 'all' } });
            expect((await loader(callerIn(person(7), 18), all)).id).toBe('u7');
            await expect(loader(callerIn(person(8), 18), all)).rejects.toMatchObject({ output: { statusCode: 404 } });
            await expect(loader(callerIn(person(7), 18))).rejects.toMatchObject({ output: { statusCode: 404 } });
        });

        it('GetEntityForUser returns the tenancy beside the entity', async () => {
            const getEntityModuleForUser = new GetEntityModuleForUser({
                moduleRepository: fakeRepos({ entities: rows }).moduleRepository,
                moduleDefinitions: [],
            });
            const found = await new GetEntityForUser({ getEntityModuleForUser }).execute('x17', callerIn(person(7), 17));
            expect(found.tenancy).toMatchObject({ scope: 'organization', access: 'manage' });
        });
    });

    describe('legacy rows: an existing deployment keeps its entities', () => {
        it('an app with no organizations sees every null-organization entity of the caller, as before', async () => {
            const legacy = [entity('l1', 7, null), entity('l2', 7, null), entity('o', 8, null)];
            const repos = fakeRepos({ entities: legacy });
            const list = new ListEntitiesForUser({ moduleRepository: repos.moduleRepository });
            expect(ids(await list.execute(callerIn(person(7), null)))).toEqual(['l1', 'l2']);
        });

        it('an organization app: unscoped individual entities show in the legacy organization, not in a second one', async () => {
            const legacy = [entity('l1', 7, null)];
            const repos = fakeRepos({ entities: legacy });
            const list = new ListEntitiesForUser({ moduleRepository: repos.moduleRepository });
            expect(ids(await list.execute(callerIn(person(7, 17), 17)))).toEqual(['l1']);
            expect(ids(await list.execute(callerIn(person(7, 17), 18)))).toEqual([]);
        });

        it('organization-primary apps: the entity of the linked individual, the case ownsUserId was written for', async () => {
            // Entity 6 owned by individual 4, integration owned by organization 13, 4 linked to 13.
            const repos = fakeRepos({ entities: [entity('6', 4, null), entity('12', 13, null)] });
            const caller = callerIn(person(4, 13), 13, { primary: 'organization' });
            const list = new ListEntitiesForUser({ moduleRepository: repos.moduleRepository });
            expect(ids(await list.execute(caller))).toEqual(['12', '6']);
            expect(caller.getId()).toBe('13');
        });

        it('organization-owned unscoped entities are the organization own', async () => {
            const repos = fakeRepos({ entities: [entity('12', 13, null)] });
            const list = new ListEntitiesForUser({ moduleRepository: repos.moduleRepository });
            const result = await list.execute(callerIn(person(4), 13));
            expect(result[0].tenancy).toMatchObject({ scope: 'organization', organizationId: '13' });
        });
    });

    describe('deleting', () => {
        const build = (rowsToUse) => {
            const repos = fakeRepos({ entities: rowsToUse });
            const getEntityModuleForUser = new GetEntityModuleForUser({
                moduleRepository: repos.moduleRepository,
                moduleDefinitions: [],
            });
            return {
                repos,
                useCase: new DeleteEntityForUser({
                    getEntityModuleForUser,
                    moduleRepository: repos.moduleRepository,
                    integrationRepository: repos.integrationRepository,
                }),
            };
        };

        it('deletes an organization entity for a member of the organization', async () => {
            const { repos, useCase } = build([entity('x17', 17, 17)]);
            await useCase.execute('x17', callerIn(person(7), 17));
            expect(repos.moduleRepository.deleteEntity).toHaveBeenCalledWith('x17');
        });

        it('404s deleting an entity of another organization', async () => {
            const { repos, useCase } = build([entity('x18', 18, 18)]);
            await expect(useCase.execute('x18', callerIn(person(7), 17))).rejects.toMatchObject({ output: { statusCode: 404 } });
            expect(repos.moduleRepository.deleteEntity).not.toHaveBeenCalled();
        });

        it('a member may not delete an organization entity (403), an admin may', async () => {
            const { repos, useCase } = build([entity('x17', 17, 17)]);
            await expect(
                useCase.execute('x17', callerIn(person(7), 17, { source: 'adopter-jwt' }))
            ).rejects.toMatchObject({ output: { statusCode: 403 }, data: { code: 'ORG_ADMIN_REQUIRED' } });
            expect(repos.moduleRepository.deleteEntity).not.toHaveBeenCalled();
            const admin = callerIn(person(7), 17, { source: 'adopter-jwt' });
            admin.setOrgRole('ADMIN');
            await useCase.execute('x17', admin);
            expect(repos.moduleRepository.deleteEntity).toHaveBeenCalledWith('x17');
        });

        it("a member deletes their own entity in the organization", async () => {
            const { repos, useCase } = build([entity('g17', 7, 17)]);
            await useCase.execute('g17', callerIn(person(7), 17, { source: 'adopter-jwt' }));
            expect(repos.moduleRepository.deleteEntity).toHaveBeenCalledWith('g17');
        });

        it('deletes an entity the caller may use', async () => {
            const { repos, useCase } = build([entity('g17', 7, 17)]);
            await useCase.execute('g17', callerIn(person(7), 17));
            expect(repos.moduleRepository.deleteEntity).toHaveBeenCalledWith('g17');
        });
    });
});

describe('v1 entity use cases follow the same rule', () => {
    it('GetModule 404s... refuses the same entity from another organization', async () => {
        const repos = fakeRepos({ entities: [entity('g17', 7, 17, { externalId: 'x', name: 'n' })] });
        const definition = { moduleName: 'acme', modelName: 'acme' };
        // Module construction is the caller's problem; the access check runs first.
        const useCase = new GetModule({ moduleRepository: repos.moduleRepository, moduleDefinitions: [definition] });
        await expect(useCase.execute('g17', callerIn(person(7), 18))).rejects.toThrow(/does not belong/);
    });

    it('GetEntitiesForUser (v1 list) asks for the visible pairs', async () => {
        const repos = fakeRepos({ entities: [entity('g17', 7, 17), entity('g18', 7, 18)] });
        const useCase = new GetEntitiesForUser({
            moduleRepository: repos.moduleRepository,
            moduleDefinitions: [{ moduleName: 'acme' }],
        });
        expect(await useCase.execute(callerIn(person(7), 17))).toEqual([{ id: 'g17' }]);
        expect(repos.moduleRepository.findEntitiesByOwnership).toHaveBeenCalledWith([
            { userId: '17', organizationId: '17' },
            { userId: '17', organizationId: null },
            { userId: '7', organizationId: '17' },
        ]);
    });
});
