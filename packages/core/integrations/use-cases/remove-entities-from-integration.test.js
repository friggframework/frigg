const {
    RemoveEntitiesFromIntegration,
} = require('./remove-entities-from-integration');

const entities = [
    { id: 'quo', moduleName: 'quo' },
    { id: 'e1', moduleName: 'pages' },
    { id: 'e2', moduleName: 'pages' },
    { id: 'e3', moduleName: 'pages' },
];

function makeUseCase(integrations = {}) {
    const integrationRepository = {
        async findIntegrationById(id) {
            if (!integrations[id]) {
                throw new Error(`Integration with id ${id} not found`);
            }
            return { ...integrations[id] };
        },
        removeEntitiesFromIntegration: jest.fn(async (id, entityIds) => {
            const integration = integrations[id];
            if (!integration) return null;
            integration.entitiesIds = integration.entitiesIds.filter(
                (entityId) => !entityIds.includes(entityId)
            );
            return { ...integration };
        }),
    };
    const moduleRepository = {
        async findEntitiesByIds(ids) {
            return entities.filter((e) => ids.includes(e.id));
        },
    };
    return {
        useCase: new RemoveEntitiesFromIntegration({
            integrationRepository,
            moduleRepository,
        }),
        integrationRepository,
    };
}

const integration = () => ({
    id: 'i1',
    entitiesIds: ['quo', 'e1', 'e2', 'e3'],
});

describe('RemoveEntitiesFromIntegration', () => {
    it('returns the integration without the detached entities', async () => {
        const { useCase } = makeUseCase({ i1: integration() });

        const result = await useCase.execute('i1', ['e2']);

        expect(result.entitiesIds).toEqual(['quo', 'e1', 'e3']);
    });

    it('ignores entities that are not attached', async () => {
        const { useCase } = makeUseCase({
            i1: { id: 'i1', entitiesIds: ['quo', 'e1', 'e2'] },
        });

        const result = await useCase.execute('i1', ['e3']);

        expect(result.entitiesIds).toEqual(['quo', 'e1', 'e2']);
    });

    it.each([
        ['the last entity of a module', ['quo']],
        ['every entity of a module', ['e1', 'e2', 'e3']],
        ['every entity', ['quo', 'e1', 'e2', 'e3']],
    ])(
        'throws LAST_ENTITY_OF_MODULE and detaches nothing when removing %s',
        async (_, entityIds) => {
            const { useCase, integrationRepository } = makeUseCase({
                i1: integration(),
            });

            await expect(
                useCase.execute('i1', entityIds)
            ).rejects.toMatchObject({ code: 'LAST_ENTITY_OF_MODULE' });
            expect(
                integrationRepository.removeEntitiesFromIntegration
            ).not.toHaveBeenCalled();
        }
    );

    it('lets a repository failure other than not-found propagate', async () => {
        const { useCase, integrationRepository } = makeUseCase({
            i1: integration(),
        });
        integrationRepository.findIntegrationById = async () => {
            throw new Error('connection reset');
        };

        await expect(useCase.execute('i1', ['e2'])).rejects.toThrow(
            'connection reset'
        );
    });

    it('throws INTEGRATION_NOT_FOUND for an unknown integration', async () => {
        const { useCase } = makeUseCase();

        await expect(useCase.execute('missing', ['e1'])).rejects.toMatchObject({
            code: 'INTEGRATION_NOT_FOUND',
        });
    });

    it.each([
        ['no integrationId', undefined, ['e1']],
        ['no entityIds', 'i1', undefined],
        ['an empty entityIds array', 'i1', []],
    ])(
        'throws INVALID_INTEGRATION_DATA for %s',
        async (_, integrationId, entityIds) => {
            const { useCase } = makeUseCase({ i1: integration() });

            await expect(
                useCase.execute(integrationId, entityIds)
            ).rejects.toMatchObject({ code: 'INVALID_INTEGRATION_DATA' });
        }
    );
});
