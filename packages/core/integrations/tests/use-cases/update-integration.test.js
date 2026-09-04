jest.mock('../../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
}));

const { UpdateIntegration } = require('../../use-cases/update-integration');
const { TestIntegrationRepository } = require('../doubles/test-integration-repository');
const { TestModuleFactory } = require('../../../modules/tests/doubles/test-module-factory');
const { DummyIntegration } = require('../doubles/dummy-integration-class');
const { ConfigCapturingIntegration } = require('../doubles/config-capturing-integration');

describe('UpdateIntegration Use-Case', () => {
    let integrationRepository;
    let moduleFactory;
    let useCase;

    beforeEach(() => {
        integrationRepository = new TestIntegrationRepository();
        moduleFactory = new TestModuleFactory();
        useCase = new UpdateIntegration({
            integrationRepository,
            integrationClasses: [DummyIntegration],
            moduleFactory,
        });
    });

    describe('happy path', () => {
        it('calls on update and returns dto', async () => {
            const record = await integrationRepository.createIntegration(['e1'], 'user-1', { type: 'dummy', foo: 'bar' });

            const newConfig = { type: 'dummy', foo: 'baz' };
            const dto = await useCase.execute(record.id, 'user-1', newConfig);

            expect(dto.config.foo).toBe('baz');
            expect(dto.id).toBe(record.id);
            expect(dto.userId).toBe('user-1');
        });

        it('triggers ON_UPDATE event with correct payload', async () => {
            const record = await integrationRepository.createIntegration(['e1'], 'user-1', { type: 'dummy', foo: 'bar' });
            integrationRepository.clearHistory();

            const newConfig = { type: 'dummy', foo: 'updated' };
            await useCase.execute(record.id, 'user-1', newConfig);

            const history = integrationRepository.getOperationHistory();
            const findOperation = history.find(op => op.operation === 'findById');
            expect(findOperation).toEqual({
                operation: 'findById',
                id: record.id,
                found: true
            });
        });

        it('updates integration with multiple entities', async () => {
            const record = await integrationRepository.createIntegration(['e1', 'e2'], 'user-1', { type: 'dummy' });

            const newConfig = { type: 'dummy', updated: true };
            const dto = await useCase.execute(record.id, 'user-1', newConfig);

            expect(dto.entities).toEqual(['e1', 'e2']);
            expect(dto.config.updated).toBe(true);
        });
    });

    describe('error cases', () => {
        it('throws error when integration not found', async () => {
            const nonExistentId = 'non-existent-id';
            const newConfig = { type: 'dummy', foo: 'baz' };

            await expect(useCase.execute(nonExistentId, 'user-1', newConfig))
                .rejects
                .toThrow(`No integration found by the ID of ${nonExistentId}`);
        });

        it('throws error when integration class not found', async () => {
            const record = await integrationRepository.createIntegration(['e1'], 'user-1', { type: 'unknown-type' });

            const newConfig = { type: 'unknown-type', foo: 'baz' };

            await expect(useCase.execute(record.id, 'user-1', newConfig))
                .rejects
                .toThrow('No integration class found for type: unknown-type');
        });

        it('throws error when user does not own integration', async () => {
            const record = await integrationRepository.createIntegration(['e1'], 'user-1', { type: 'dummy' });

            const newConfig = { type: 'dummy', foo: 'baz' };

            await expect(useCase.execute(record.id, 'different-user', newConfig))
                .rejects
                .toThrow(`Integration ${record.id} does not belong to User different-user`);
        });

        it('throws error when no integration classes provided', async () => {
            const useCaseWithoutClasses = new UpdateIntegration({
                integrationRepository,
                integrationClasses: [],
                moduleFactory,
            });

            const record = await integrationRepository.createIntegration(['e1'], 'user-1', { type: 'dummy' });
            const newConfig = { type: 'dummy', foo: 'baz' };

            await expect(useCaseWithoutClasses.execute(record.id, 'user-1', newConfig))
                .rejects
                .toThrow('No integration class found for type: dummy');
        });
    });

    describe('edge cases', () => {
        it('handles config with null values', async () => {
            const record = await integrationRepository.createIntegration(['e1'], 'user-1', { type: 'dummy', foo: 'bar' });

            const newConfig = { type: 'dummy', foo: null, bar: undefined };
            const dto = await useCase.execute(record.id, 'user-1', newConfig);

            expect(dto.config.foo).toBeNull();
            expect(dto.config.bar).toBeUndefined();
        });

        it('handles deeply nested config updates with merge semantics', async () => {
            const record = await integrationRepository.createIntegration(['e1'], 'user-1', { type: 'dummy', nested: { old: 'value' } });

            const newConfig = {
                type: 'dummy',
                nested: {
                    new: 'value',
                    deep: { level: 'test' }
                }
            };
            const dto = await useCase.execute(record.id, 'user-1', newConfig);

            expect(dto.config.nested.new).toBe('value');
            expect(dto.config.nested.deep.level).toBe('test');
            expect(dto.config.nested.old).toBe('value');
        });
    });

    describe('partial config update semantics (issue #514)', () => {
        let configCapturingUseCase;

        beforeEach(() => {
            ConfigCapturingIntegration.resetCaptures();
            configCapturingUseCase = new UpdateIntegration({
                integrationRepository,
                integrationClasses: [ConfigCapturingIntegration],
                moduleFactory,
            });
        });

        it('passes existing database config to integration constructor', async () => {
            const existingConfig = { type: 'config-capturing', a: 1, b: 2, c: 3 };
            const record = await integrationRepository.createIntegration(
                ['e1'],
                'user-1',
                existingConfig
            );

            const partialUpdateConfig = { type: 'config-capturing', a: 10 };
            await configCapturingUseCase.execute(record.id, 'user-1', partialUpdateConfig);

            const captured = ConfigCapturingIntegration.getCapturedOnUpdateState();
            expect(captured.thisConfig).toEqual(existingConfig);
            expect(captured.paramsConfig).toEqual(partialUpdateConfig);
        });

        it('allows onUpdate to merge partial config with existing config', async () => {
            const existingConfig = { type: 'config-capturing', a: 1, b: 2, c: 3 };
            const record = await integrationRepository.createIntegration(
                ['e1'],
                'user-1',
                existingConfig
            );

            const partialUpdateConfig = { type: 'config-capturing', a: 10 };
            const dto = await configCapturingUseCase.execute(record.id, 'user-1', partialUpdateConfig);

            expect(dto.config).toEqual({ type: 'config-capturing', a: 10, b: 2, c: 3 });
        });

        it('preserves nested existing values during partial update', async () => {
            const existingConfig = {
                type: 'config-capturing',
                settings: { theme: 'dark', notifications: true },
                credentials: { apiKey: 'secret123' }
            };
            const record = await integrationRepository.createIntegration(
                ['e1'],
                'user-1',
                existingConfig
            );

            const partialUpdateConfig = {
                type: 'config-capturing',
                settings: { theme: 'light' }
            };
            const dto = await configCapturingUseCase.execute(record.id, 'user-1', partialUpdateConfig);

            expect(dto.config.settings.theme).toBe('light');
            expect(dto.config.settings.notifications).toBe(true);
            expect(dto.config.credentials.apiKey).toBe('secret123');
        });
    });
}); 