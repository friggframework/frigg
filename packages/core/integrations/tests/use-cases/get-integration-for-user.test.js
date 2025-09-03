const { GetIntegrationForUser } = require('../../use-cases/get-integration-for-user');
const { TestIntegrationRepository } = require('../doubles/test-integration-repository');
const { TestModuleFactory } = require('../../../modules/tests/doubles/test-module-factory');
const { TestModuleRepository } = require('../../../modules/tests/doubles/test-module-repository');
const { DummyIntegration } = require('../doubles/dummy-integration-class');

describe('GetIntegrationForUser Use-Case', () => {
    let integrationRepository;
    let moduleRepository;
    let moduleFactory;
    let useCase;

    beforeEach(() => {
        integrationRepository = new TestIntegrationRepository();
        moduleRepository = new TestModuleRepository();
        moduleFactory = new TestModuleFactory();
        useCase = new GetIntegrationForUser({
            integrationRepository,
            integrationClasses: [DummyIntegration],
            moduleFactory,
            moduleRepository,
        });
    });

    describe('happy path', () => {
        it('returns integration dto', async () => {
            const entity = { id: 'entity-1', _id: 'entity-1' };
            moduleRepository.addEntity(entity);

            const record = await integrationRepository.createIntegration([entity.id], 'user-1', { type: 'dummy' });

            const dto = await useCase.execute(record.id, 'user-1');
            expect(dto.id).toBe(record.id);
            expect(dto.userId).toBe('user-1');
            expect(dto.config.type).toBe('dummy');
        });

        it('returns integration with multiple entities', async () => {
            const entity1 = { id: 'entity-1', _id: 'entity-1' };
            const entity2 = { id: 'entity-2', _id: 'entity-2' };
            moduleRepository.addEntity(entity1);
            moduleRepository.addEntity(entity2);

            const record = await integrationRepository.createIntegration([entity1.id, entity2.id], 'user-1', { type: 'dummy' });

            const dto = await useCase.execute(record.id, 'user-1');
            expect(dto.entities).toEqual([entity1, entity2]);
        });

        it('returns integration with complex config', async () => {
            const entity = { id: 'entity-1', _id: 'entity-1' };
            moduleRepository.addEntity(entity);

            const complexConfig = {
                type: 'dummy',
                settings: { api: { timeout: 5000 }, debug: true },
                features: ['webhooks', 'sync']
            };

            const record = await integrationRepository.createIntegration([entity.id], 'user-1', complexConfig);

            const dto = await useCase.execute(record.id, 'user-1');
            expect(dto.config).toEqual(complexConfig);
        });
    });

    describe('error cases', () => {
        it('throws error when integration not found', async () => {
            const nonExistentId = 'non-existent-id';

            await expect(useCase.execute(nonExistentId, 'user-1'))
                .rejects
                .toThrow();
        });

        it('throws error when user does not own integration', async () => {
            const entity = { id: 'entity-1', _id: 'entity-1' };
            moduleRepository.addEntity(entity);

            const record = await integrationRepository.createIntegration([entity.id], 'user-1', { type: 'dummy' });

            await expect(useCase.execute(record.id, 'different-user'))
                .rejects
                .toThrow();
        });

        it('throws error when integration class not found', async () => {
            const useCaseWithoutClasses = new GetIntegrationForUser({
                integrationRepository,
                integrationClasses: [],
                moduleFactory,
                moduleRepository,
            });

            const entity = { id: 'entity-1', _id: 'entity-1' };
            moduleRepository.addEntity(entity);

            const record = await integrationRepository.createIntegration([entity.id], 'user-1', { type: 'dummy' });

            await expect(useCaseWithoutClasses.execute(record.id, 'user-1'))
                .rejects
                .toThrow();
        });

        it('handles missing entities gracefully', async () => {
            const record = await integrationRepository.createIntegration(['missing-entity'], 'user-1', { type: 'dummy' });

            await expect(useCase.execute(record.id, 'user-1'))
                .rejects
                .toThrow();
        });
    });

    describe('edge cases', () => {
        it('handles userId as string vs number comparison', async () => {
            const entity = { id: 'entity-1', _id: 'entity-1' };
            moduleRepository.addEntity(entity);

            const record = await integrationRepository.createIntegration([entity.id], 'user-1', { type: 'dummy' });

            const dto1 = await useCase.execute(record.id, 'user-1');
            const dto2 = await useCase.execute(record.id, 'user-1');

            expect(dto1.userId).toBe(dto2.userId);
        });

        it('returns all integration properties', async () => {
            const entity = { id: 'entity-1', _id: 'entity-1' };
            moduleRepository.addEntity(entity);

            const record = await integrationRepository.createIntegration([entity.id], 'user-1', { type: 'dummy' });

            record.status = 'ACTIVE';
            record.version = '1.0.0';
            record.messages = { info: [{ title: 'Test', message: 'Message' }] };

            const dto = await useCase.execute(record.id, 'user-1');
            expect(dto.status).toBe('ACTIVE');
            expect(dto.version).toBe('1.0.0');
            expect(dto.messages).toEqual({ info: [{ title: 'Test', message: 'Message' }] });
        });
    });
}); 