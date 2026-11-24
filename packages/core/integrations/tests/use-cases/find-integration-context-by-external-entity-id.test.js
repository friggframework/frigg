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

    it('throws when externalId is missing', async () => {
        await expect(useCase.execute({ type: 'dummy' })).rejects.toHaveProperty(
            'code',
            'EXTERNAL_ID_REQUIRED',
        );
    });

    it('throws when type is missing', async () => {
        await expect(
            useCase.execute({ externalId: 'ext-1' }),
        ).rejects.toHaveProperty('code', 'TYPE_REQUIRED');
    });

    it('throws when entity is not found', async () => {
        await expect(
            useCase.execute({ externalId: 'abc', type: 'dummy' }),
        ).rejects.toHaveProperty('code', 'ENTITY_NOT_FOUND');
    });

    it('throws when no integration of that type is bound to the entity', async () => {
        const entity = {
            id: 'entity-1',
            externalId: 'ext-1',
            userId: 'user-1',
        };
        moduleRepository.addEntity(entity);
        await integrationRepository.createIntegration(
            [entity.id],
            entity.userId,
            { type: 'other' },
        );

        await expect(
            useCase.execute({ externalId: 'ext-1', type: 'dummy' }),
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

        const result = await useCase.execute({
            externalId: 'ext-1',
            type: 'dummy',
        });

        expect(loadIntegrationContextUseCase.execute).toHaveBeenCalledWith({
            integrationRecord,
        });
        expect(result.context).toEqual(expectedContext);
        expect(result.entity).toEqual(entity);
        expect(result.record).toEqual(integrationRecord);
    });
});
