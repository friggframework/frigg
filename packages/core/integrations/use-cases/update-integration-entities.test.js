const {
    AddEntitiesToIntegration,
    RemoveEntitiesFromIntegration,
} = require('./update-integration-entities');

function makeRepository(integrations) {
    return {
        async addEntitiesToIntegration(integrationId, entityIds) {
            const integration = integrations[integrationId];
            if (!integration) return null;
            integration.entitiesIds = [
                ...new Set([...integration.entitiesIds, ...entityIds]),
            ];
            return { ...integration };
        },
        async removeEntitiesFromIntegration(integrationId, entityIds) {
            const integration = integrations[integrationId];
            if (!integration) return null;
            integration.entitiesIds = integration.entitiesIds.filter(
                (id) => !entityIds.includes(id)
            );
            return { ...integration };
        },
    };
}

describe.each([
    ['AddEntitiesToIntegration', AddEntitiesToIntegration],
    ['RemoveEntitiesFromIntegration', RemoveEntitiesFromIntegration],
])('%s', (_, UseCase) => {
    it('throws INTEGRATION_NOT_FOUND for an unknown integration', async () => {
        const useCase = new UseCase({
            integrationRepository: makeRepository({}),
        });

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
        async (__, integrationId, entityIds) => {
            const useCase = new UseCase({
                integrationRepository: makeRepository({
                    i1: { id: 'i1', entitiesIds: ['e1'] },
                }),
            });

            await expect(
                useCase.execute(integrationId, entityIds)
            ).rejects.toMatchObject({ code: 'INVALID_INTEGRATION_DATA' });
        }
    );
});

describe('AddEntitiesToIntegration', () => {
    it('returns the integration with the entities attached', async () => {
        const useCase = new AddEntitiesToIntegration({
            integrationRepository: makeRepository({
                i1: { id: 'i1', entitiesIds: ['e1'] },
            }),
        });

        const result = await useCase.execute('i1', ['e2', 'e3']);

        expect(result.entitiesIds).toEqual(['e1', 'e2', 'e3']);
    });
});

describe('RemoveEntitiesFromIntegration', () => {
    it('returns the integration without the detached entities', async () => {
        const useCase = new RemoveEntitiesFromIntegration({
            integrationRepository: makeRepository({
                i1: { id: 'i1', entitiesIds: ['e1', 'e2', 'e3'] },
            }),
        });

        const result = await useCase.execute('i1', ['e2']);

        expect(result.entitiesIds).toEqual(['e1', 'e3']);
    });
});
