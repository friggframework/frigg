const { GetIntegrationInstance } = require('../../use-cases/get-integration-instance');
const { TestIntegrationRepository } = require('../doubles/test-integration-repository');
const { TestModuleFactory } = require('../../../modules/tests/doubles/test-module-factory');
const { DummyIntegration } = require('../doubles/dummy-integration-class');

describe('GetIntegrationInstance Use-Case', () => {
    let integrationRepository;
    let moduleFactory;
    let useCase;

    beforeEach(() => {
        integrationRepository = new TestIntegrationRepository();
        moduleFactory = new TestModuleFactory();
        useCase = new GetIntegrationInstance({
            integrationRepository,
            integrationClasses: [DummyIntegration],
            moduleFactory,
        });
    });

    describe('happy path', () => {
        it('returns hydrated integration instance', async () => {
            const record = await integrationRepository.createIntegration(['entity-1'], 'user-1', { type: 'dummy' });

            const instance = await useCase.execute(record.id, 'user-1');

            expect(instance.id).toBe(record.id);
            expect(instance.getConfig().type).toBe('dummy');
            expect(instance.entities).toEqual(record.entitiesIds);
            expect(instance.userId).toBe('user-1');
        });

        it('returns instance with multiple modules', async () => {
            const record = await integrationRepository.createIntegration(['entity-1', 'entity-2'], 'user-1', { type: 'dummy' });

            const instance = await useCase.execute(record.id, 'user-1');

            expect(instance.entities).toEqual(['entity-1', 'entity-2']);
            expect(Object.keys(instance.modules)).toHaveLength(1);
            expect(instance.modules['stubModule']).toBeDefined();
        });

        it('initializes integration instance properly', async () => {
            const record = await integrationRepository.createIntegration(['entity-1'], 'user-1', { type: 'dummy' });

            const instance = await useCase.execute(record.id, 'user-1');

            expect(typeof instance.send).toBe('function');
            expect(typeof instance.getConfig).toBe('function');
            expect(typeof instance.initialize).toBe('function');
        });

        it('preserves all integration properties', async () => {
            const record = await integrationRepository.createIntegration(['entity-1'], 'user-1', { type: 'dummy', custom: 'value' });

            record.status = 'ACTIVE';
            record.version = '2.0.0';
            record.messages = { logs: [{ title: 'Test', message: 'Log entry' }] };

            const instance = await useCase.execute(record.id, 'user-1');

            expect(instance.status).toBe('ACTIVE');
            expect(instance.version).toBe('2.0.0');
            expect(instance.messages).toEqual({ logs: [{ title: 'Test', message: 'Log entry' }] });
            expect(instance.getConfig().custom).toBe('value');
        });
    });

    describe('error cases', () => {
        it('throws error when integration not found', async () => {
            const nonExistentId = 'non-existent-id';

            await expect(useCase.execute(nonExistentId, 'user-1'))
                .rejects
                .toThrow(`No integration found by the ID of ${nonExistentId}`);
        });

        it('throws error when user does not own integration', async () => {
            const record = await integrationRepository.createIntegration(['entity-1'], 'user-1', { type: 'dummy' });

            await expect(useCase.execute(record.id, 'different-user'))
                .rejects
                .toThrow(`Integration ${record.id} does not belong to User different-user`);
        });

        it('throws error when integration class not found', async () => {
            const useCaseWithoutClasses = new GetIntegrationInstance({
                integrationRepository,
                integrationClasses: [],
                moduleFactory,
            });

            const record = await integrationRepository.createIntegration(['entity-1'], 'user-1', { type: 'dummy' });

            await expect(useCaseWithoutClasses.execute(record.id, 'user-1'))
                .rejects
                .toThrow('No integration class found for type: dummy');
        });

        it('throws error when integration has unknown type', async () => {
            const record = await integrationRepository.createIntegration(['entity-1'], 'user-1', { type: 'unknown-type' });

            await expect(useCase.execute(record.id, 'user-1'))
                .rejects
                .toThrow('No integration class found for type: unknown-type');
        });
    });

    describe('edge cases', () => {
        it('handles integration with no entities', async () => {
            const record = await integrationRepository.createIntegration([], 'user-1', { type: 'dummy' });

            const instance = await useCase.execute(record.id, 'user-1');

            expect(instance.entities).toEqual([]);
            expect(Object.keys(instance.modules)).toHaveLength(0);
        });

        it('handles integration with null config values', async () => {
            const record = await integrationRepository.createIntegration(['entity-1'], 'user-1', { type: 'dummy', nullValue: null });

            const instance = await useCase.execute(record.id, 'user-1');

            expect(instance.getConfig().nullValue).toBeNull();
        });

        it('handles userId comparison edge cases', async () => {
            const record = await integrationRepository.createIntegration(['entity-1'], 'user-1', { type: 'dummy' });

            const instance1 = await useCase.execute(record.id, 'user-1');
            const instance2 = await useCase.execute(record.id, 'user-1');

            expect(instance1.userId).toBe(instance2.userId);
        });

        it('returns fresh instance on each call', async () => {
            const record = await integrationRepository.createIntegration(['entity-1'], 'user-1', { type: 'dummy' });

            const instance1 = await useCase.execute(record.id, 'user-1');
            const instance2 = await useCase.execute(record.id, 'user-1');

            expect(instance1).not.toBe(instance2);
            expect(instance1.id).toBe(instance2.id);
        });

        it('handles complex nested config structures', async () => {
            const complexConfig = {
                type: 'dummy',
                settings: {
                    api: {
                        timeout: 5000,
                        retries: 3,
                        endpoints: ['users', 'orders']
                    },
                    features: {
                        webhooks: true,
                        sync: { interval: 300 }
                    }
                }
            };

            const record = await integrationRepository.createIntegration(['entity-1'], 'user-1', complexConfig);

            const instance = await useCase.execute(record.id, 'user-1');

            expect(instance.getConfig()).toEqual(complexConfig);
        });
    });
}); 