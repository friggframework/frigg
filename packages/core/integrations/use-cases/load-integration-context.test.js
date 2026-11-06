const { LoadIntegrationContextUseCase } = require('./load-integration-context');

class FakeIntegration {}
FakeIntegration.Definition = {
    name: 'fake',
    modules: {},
};

describe('LoadIntegrationContextUseCase', () => {
    it('throws when neither integrationId nor integrationRecord resolve to a record', async () => {
        const integrationRepository = {
            findIntegrationById: jest.fn().mockResolvedValue(null),
        };

        const useCase = new LoadIntegrationContextUseCase({
            integrationClass: FakeIntegration,
            integrationRepository,
            moduleRepository: { findEntitiesByIds: jest.fn() },
            moduleFactory: { getModuleInstance: jest.fn() },
        });

        await expect(
            useCase.execute({ integrationId: 'missing-id' })
        ).rejects.toMatchObject({
            message: 'Integration record not found',
            code: 'INTEGRATION_RECORD_NOT_FOUND',
        });
    });

    it('returns record with empty entities/modules when no entity ids provided', async () => {
        const integrationRecord = {
            id: 'integration-1',
            userId: 'user-1',
            entitiesIds: [],
        };

        const moduleRepository = { findEntitiesByIds: jest.fn() };
        const moduleFactory = { getModuleInstance: jest.fn() };

        const useCase = new LoadIntegrationContextUseCase({
            integrationClass: FakeIntegration,
            integrationRepository: {},
            moduleRepository,
            moduleFactory,
        });

        const result = await useCase.execute({ integrationRecord });

        expect(result).toEqual({
            record: {
                ...integrationRecord,
                entities: [],
            },
            modules: [],
        });
        expect(moduleRepository.findEntitiesByIds).not.toHaveBeenCalled();
        expect(moduleFactory.getModuleInstance).not.toHaveBeenCalled();
    });

    it('hydrates modules and entities when entity ids are provided', async () => {
        const integrationRecord = {
            id: 'integration-2',
            userId: 'user-2',
            entitiesIds: ['entity-1', 'entity-2'],
        };

        const entities = [
            { id: 'entity-1', name: 'First Entity' },
            { id: 'entity-2', name: 'Second Entity' },
        ];

        const modules = [{ name: 'module-1' }, { name: 'module-2' }];

        const moduleRepository = {
            findEntitiesByIds: jest.fn().mockResolvedValue(entities),
        };
        const moduleFactory = {
            getModuleInstance: jest
                .fn()
                .mockResolvedValueOnce(modules[0])
                .mockResolvedValueOnce(modules[1]),
        };

        const useCase = new LoadIntegrationContextUseCase({
            integrationClass: FakeIntegration,
            integrationRepository: {},
            moduleRepository,
            moduleFactory,
        });

        const result = await useCase.execute({ integrationRecord });

        expect(moduleRepository.findEntitiesByIds).toHaveBeenCalledWith(
            integrationRecord.entitiesIds
        );
        expect(moduleFactory.getModuleInstance).toHaveBeenNthCalledWith(
            1,
            'entity-1',
            integrationRecord.userId
        );
        expect(moduleFactory.getModuleInstance).toHaveBeenNthCalledWith(
            2,
            'entity-2',
            integrationRecord.userId
        );
        expect(result).toEqual({
            record: {
                ...integrationRecord,
                entities,
            },
            modules,
        });
    });
});
