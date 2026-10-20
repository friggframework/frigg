const { AddEntitiesToIntegration } = require('./add-entities-to-integration');

function makeUseCase({ integrations = {}, entities = [] } = {}) {
    const integrationRepository = {
        async findIntegrationById(id) {
            if (!integrations[id]) {
                throw new Error(`Integration with id ${id} not found`);
            }
            return { ...integrations[id] };
        },
        addEntitiesToIntegration: jest.fn(async (id, entityIds) => {
            const integration = integrations[id];
            if (!integration) return null;
            integration.entitiesIds = [
                ...new Set([...integration.entitiesIds, ...entityIds]),
            ];
            return { ...integration };
        }),
    };
    const moduleRepository = {
        async findEntitiesByIds(ids) {
            return entities.filter((e) => ids.includes(e.id));
        },
    };
    return {
        useCase: new AddEntitiesToIntegration({
            integrationRepository,
            moduleRepository,
        }),
        integrationRepository,
    };
}

const owner = { id: 'i1', userId: 'u1', entitiesIds: ['quo', 'e1'] };
const attached = [
    { id: 'quo', userId: 'u1', moduleName: 'quo' },
    { id: 'e1', userId: 'u1', moduleName: 'pages' },
];

describe('AddEntitiesToIntegration', () => {
    it('attaches entities owned by the integration user', async () => {
        const { useCase } = makeUseCase({
            integrations: { i1: { ...owner } },
            entities: [
                ...attached,
                { id: 'e2', userId: 'u1', moduleName: 'pages' },
                { id: 'e3', userId: 'u1', moduleName: 'pages' },
            ],
        });

        const result = await useCase.execute('i1', ['e2', 'e3']);

        expect(result.entitiesIds).toEqual(['quo', 'e1', 'e2', 'e3']);
    });

    it('throws INTEGRATION_NOT_FOUND for an unknown integration', async () => {
        const { useCase } = makeUseCase();

        await expect(useCase.execute('missing', ['e1'])).rejects.toMatchObject({
            code: 'INTEGRATION_NOT_FOUND',
        });
    });

    it('throws ENTITIES_NOT_FOUND and attaches nothing when an entity does not exist', async () => {
        const { useCase, integrationRepository } = makeUseCase({
            integrations: { i1: { ...owner } },
            entities: [
                ...attached,
                { id: 'e2', userId: 'u1', moduleName: 'pages' },
            ],
        });

        await expect(
            useCase.execute('i1', ['e2', 'missing'])
        ).rejects.toMatchObject({ code: 'ENTITIES_NOT_FOUND' });
        expect(
            integrationRepository.addEntitiesToIntegration
        ).not.toHaveBeenCalled();
    });

    it("throws ENTITY_USER_MISMATCH and attaches nothing for another user's entity", async () => {
        const { useCase, integrationRepository } = makeUseCase({
            integrations: { i1: { ...owner } },
            entities: [
                ...attached,
                { id: 'e2', userId: 'someone-else', moduleName: 'pages' },
            ],
        });

        await expect(useCase.execute('i1', ['e2'])).rejects.toMatchObject({
            code: 'ENTITY_USER_MISMATCH',
        });
        expect(
            integrationRepository.addEntitiesToIntegration
        ).not.toHaveBeenCalled();
    });

    it('throws ENTITY_MODULE_MISMATCH and attaches nothing for a module the integration does not hold', async () => {
        const { useCase, integrationRepository } = makeUseCase({
            integrations: { i1: { ...owner } },
            entities: [
                ...attached,
                { id: 'e2', userId: 'u1', moduleName: 'some-other-module' },
            ],
        });

        await expect(useCase.execute('i1', ['e2'])).rejects.toMatchObject({
            code: 'ENTITY_MODULE_MISMATCH',
        });
        expect(
            integrationRepository.addEntitiesToIntegration
        ).not.toHaveBeenCalled();
    });

    it.each([
        ['no integrationId', undefined, ['e1']],
        ['no entityIds', 'i1', undefined],
        ['an empty entityIds array', 'i1', []],
    ])(
        'throws INVALID_INTEGRATION_DATA for %s',
        async (_, integrationId, entityIds) => {
            const { useCase } = makeUseCase({
                integrations: { i1: { ...owner } },
            });

            await expect(
                useCase.execute(integrationId, entityIds)
            ).rejects.toMatchObject({ code: 'INVALID_INTEGRATION_DATA' });
        }
    );
});
