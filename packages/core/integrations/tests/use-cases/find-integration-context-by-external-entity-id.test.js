const { FindIntegrationContextByExternalEntityIdUseCase } = require('../../use-cases/find-integration-context-by-external-entity-id');
const { TestModuleRepository } = require('../../../modules/tests/doubles/test-module-repository');
const { TestIntegrationRepository } = require('../doubles/test-integration-repository');
const { DummyIntegration } = require('../doubles/dummy-integration-class');

describe('FindIntegrationContextByExternalEntityIdUseCase', () => {
    let moduleRepository;
    let integrationRepository;
    let loadIntegrationContextUseCase;
    let useCase;

    beforeEach(() => {
        moduleRepository = new TestModuleRepository();
        integrationRepository = new TestIntegrationRepository();
        loadIntegrationContextUseCase = {
            execute: jest.fn(),
        };
        useCase = new FindIntegrationContextByExternalEntityIdUseCase({
            moduleRepository,
            integrationRepository,
            loadIntegrationContextUseCase,
        });
    });

    it('throws when externalEntityId is missing', async () => {
        await expect(useCase.execute({})).rejects.toHaveProperty(
            'code',
            'EXTERNAL_ENTITY_ID_REQUIRED',
        );
    });

    it('throws when entity is not found', async () => {
        await expect(
            useCase.execute({ externalEntityId: 'abc' }),
        ).rejects.toHaveProperty('code', 'ENTITY_NOT_FOUND');
    });

    it('throws when entity user is missing', async () => {
        moduleRepository.addEntity({
            id: 'entity-1',
            externalId: 'ext-1',
        });

        await expect(
            useCase.execute({ externalEntityId: 'ext-1' }),
        ).rejects.toHaveProperty('code', 'ENTITY_USER_NOT_FOUND');
    });

    it('throws when integration is not found for user', async () => {
        moduleRepository.addEntity({
            id: 'entity-1',
            externalId: 'ext-1',
            userId: 'user-1',
        });

        await expect(
            useCase.execute({ externalEntityId: 'ext-1' }),
        ).rejects.toHaveProperty('code', 'INTEGRATION_NOT_FOUND');
    });

    it('returns context, entity, and record on success', async () => {
        const entity = {
            id: 'entity-1',
            externalId: 'ext-1',
            userId: 'user-1',
        };
        moduleRepository.addEntity(entity);

        const integrationRecord = await integrationRepository.createIntegration(
            [entity.id],
            entity.userId,
            { type: 'dummy' },
        );

        const expectedContext = {
            record: integrationRecord,
            modules: [{ id: 'module-1' }],
        };
        loadIntegrationContextUseCase.execute.mockResolvedValue(
            expectedContext,
        );

        const result = await useCase.execute({ externalEntityId: 'ext-1' });

        expect(loadIntegrationContextUseCase.execute).toHaveBeenCalledWith({
            integrationRecord,
        });
        expect(result.context).toEqual(expectedContext);
        expect(result.entity).toEqual(entity);
        expect(result.record).toEqual(integrationRecord);
    });
});
