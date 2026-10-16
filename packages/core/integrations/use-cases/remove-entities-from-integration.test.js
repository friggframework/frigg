const {
    RemoveEntitiesFromIntegration,
} = require('./remove-entities-from-integration');

function makeUseCase(integrations = {}) {
    return new RemoveEntitiesFromIntegration({
        integrationRepository: {
            async removeEntitiesFromIntegration(id, entityIds) {
                const integration = integrations[id];
                if (!integration) return null;
                integration.entitiesIds = integration.entitiesIds.filter(
                    (entityId) => !entityIds.includes(entityId)
                );
                return { ...integration };
            },
        },
    });
}

describe('RemoveEntitiesFromIntegration', () => {
    it('returns the integration without the detached entities', async () => {
        const useCase = makeUseCase({
            i1: { id: 'i1', entitiesIds: ['e1', 'e2', 'e3'] },
        });

        const result = await useCase.execute('i1', ['e2']);

        expect(result.entitiesIds).toEqual(['e1', 'e3']);
    });

    it('throws INTEGRATION_NOT_FOUND for an unknown integration', async () => {
        await expect(
            makeUseCase().execute('missing', ['e1'])
        ).rejects.toMatchObject({ code: 'INTEGRATION_NOT_FOUND' });
    });

    it.each([
        ['no integrationId', undefined, ['e1']],
        ['no entityIds', 'i1', undefined],
        ['an empty entityIds array', 'i1', []],
    ])(
        'throws INVALID_INTEGRATION_DATA for %s',
        async (_, integrationId, entityIds) => {
            await expect(
                makeUseCase().execute(integrationId, entityIds)
            ).rejects.toMatchObject({ code: 'INVALID_INTEGRATION_DATA' });
        }
    );
});
