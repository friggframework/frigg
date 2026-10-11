const { GetEntityModuleForUser } = require('./get-entity-module-for-user');
const {
    ListEntitiesForUser,
    GetEntityForUser,
    TestEntityAuthForUser,
    GetEntityOptionsForUser,
    RefreshEntityOptionsForUser,
    DeleteEntityForUser,
} = require('./entity-operations-for-user');

const user = { getId: () => 'u1' };
const entity = { id: 'e1', userId: 'u1', moduleName: 'acme', credential: { id: 'c1' } };

function setup({ module: moduleOverrides = {}, integrations = [] } = {}) {
    const module = {
        testAuth: jest.fn().mockResolvedValue(true),
        getEntityOptions: jest.fn().mockResolvedValue([{ key: 'a' }]),
        refreshEntityOptions: jest.fn().mockResolvedValue([{ key: 'b' }]),
        ...moduleOverrides,
    };
    const moduleRepository = {
        findEntityById: jest.fn(async (id) => (id === 'e1' ? entity : null)),
        findEntitiesByUserId: jest.fn().mockResolvedValue([entity]),
        deleteEntity: jest.fn().mockResolvedValue(true),
    };
    const integrationRepository = {
        findIntegrationsByEntityId: jest.fn().mockResolvedValue(integrations),
    };
    const getEntityModuleForUser = new GetEntityModuleForUser({
        moduleRepository,
        moduleDefinitions: [{ moduleName: 'acme' }],
        createModule: () => module,
    });
    return { module, moduleRepository, integrationRepository, getEntityModuleForUser };
}

describe('v2 entity operations', () => {
    it('lists the caller entities', async () => {
        const { moduleRepository } = setup();
        expect(await new ListEntitiesForUser({ moduleRepository }).execute(user)).toEqual([entity]);
        expect(moduleRepository.findEntitiesByUserId).toHaveBeenCalledWith('u1');
    });

    it('gets an owned entity and 404s otherwise', async () => {
        const deps = setup();
        const useCase = new GetEntityForUser(deps);
        expect(await useCase.execute('e1', user)).toBe(entity);
        await expect(useCase.execute('e2', user)).rejects.toMatchObject({
            output: { statusCode: 404 },
        });
    });

    it('tests auth through the module', async () => {
        const deps = setup({ module: { testAuth: jest.fn().mockResolvedValue(false) } });
        expect(await new TestEntityAuthForUser(deps).execute('e1', user)).toBe(false);
    });

    it('reads and refreshes entity options', async () => {
        const deps = setup();
        expect(await new GetEntityOptionsForUser(deps).execute('e1', user)).toEqual([{ key: 'a' }]);
        expect(
            await new RefreshEntityOptionsForUser(deps).execute('e1', user, { q: 1 })
        ).toEqual([{ key: 'b' }]);
        expect(deps.module.refreshEntityOptions).toHaveBeenCalledWith({ q: 1 });
    });

    it('deletes an unused entity', async () => {
        const deps = setup();
        await new DeleteEntityForUser(deps).execute('e1', user);
        expect(deps.moduleRepository.deleteEntity).toHaveBeenCalledWith('e1');
    });

    it('refuses to delete an entity an integration uses', async () => {
        const deps = setup({ integrations: [{ id: 9 }] });
        await expect(new DeleteEntityForUser(deps).execute('e1', user)).rejects.toMatchObject({
            output: { statusCode: 409 },
            data: { code: 'ENTITY_IN_USE', details: { integrationIds: ['9'] } },
        });
        expect(deps.moduleRepository.deleteEntity).not.toHaveBeenCalled();
    });
});
