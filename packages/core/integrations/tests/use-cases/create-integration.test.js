jest.mock('../../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
}));

const { CreateIntegration } = require('../../use-cases/create-integration');
const { TestIntegrationRepository } = require('../doubles/test-integration-repository');
const { TestModuleFactory } = require('../../../modules/tests/doubles/test-module-factory');
const { DummyIntegration } = require('../doubles/dummy-integration-class');

describe('CreateIntegration Use-Case', () => {
    let integrationRepository;
    let moduleFactory;
    let useCase;

    beforeEach(() => {
        integrationRepository = new TestIntegrationRepository();
        moduleFactory = new TestModuleFactory();
        useCase = new CreateIntegration({
            integrationRepository,
            integrationClasses: [DummyIntegration],
            moduleFactory,
        });
    });

    describe('happy path', () => {
        it('creates an integration and returns DTO', async () => {
            const entities = ['entity-1'];
            const userId = 'user-1';
            const config = { type: 'dummy', foo: 'bar' };

            const dto = await useCase.execute(entities, userId, config);

            expect(dto.id).toBeDefined();
            expect(dto.config).toEqual(config);
            expect(dto.userId).toBe(userId);
            expect(dto.entities).toEqual(entities);
            expect(dto.status).toBe('NEW');
        });

        it('triggers ON_CREATE event with correct payload', async () => {
            const entities = ['entity-1'];
            const userId = 'user-1';
            const config = { type: 'dummy', foo: 'bar' };

            const dto = await useCase.execute(entities, userId, config);

            const record = await integrationRepository.findIntegrationById(dto.id);
            expect(record).toBeTruthy();

            const history = integrationRepository.getOperationHistory();
            const createOperation = history.find(op => op.operation === 'create');
            expect(createOperation).toEqual({
                operation: 'create',
                id: dto.id,
                userId,
                config
            });
        });

        it('loads modules for each entity', async () => {
            const entities = ['entity-1', 'entity-2'];
            const userId = 'user-1';
            const config = { type: 'dummy' };

            const dto = await useCase.execute(entities, userId, config);

            expect(dto.entities).toEqual(entities);
        });
    });

    describe('error cases', () => {
        it('throws error when integration class is not found', async () => {
            const entities = ['entity-1'];
            const userId = 'user-1';
            const config = { type: 'unknown-type' };

            await expect(useCase.execute(entities, userId, config))
                .rejects
                .toThrow('No integration class found for type: unknown-type');
        });

        it('throws error when no integration classes provided', async () => {
            const useCaseWithoutClasses = new CreateIntegration({
                integrationRepository,
                integrationClasses: [],
                moduleFactory,
            });

            const entities = ['entity-1'];
            const userId = 'user-1';
            const config = { type: 'dummy' };

            await expect(useCaseWithoutClasses.execute(entities, userId, config))
                .rejects
                .toThrow('No integration class found for type: dummy');
        });
    });

    describe('edge cases', () => {
        it('handles empty entities array', async () => {
            const entities = [];
            const userId = 'user-1';
            const config = { type: 'dummy' };

            const dto = await useCase.execute(entities, userId, config);

            expect(dto.entities).toEqual([]);
            expect(dto.id).toBeDefined();
        });

        it('handles complex config objects', async () => {
            const entities = ['entity-1'];
            const userId = 'user-1';
            const config = {
                type: 'dummy',
                nested: {
                    value: 123,
                    array: [1, 2, 3],
                    bool: true
                }
            };

            const dto = await useCase.execute(entities, userId, config);

            expect(dto.config).toEqual(config);
        });
    });

    describe('deduplication on re-authorize', () => {
        it('reuses an existing integration when userId, type, and entity set all match', async () => {
            const entities = ['entity-1', 'entity-2'];
            const userId = 'user-1';
            const config = { type: 'dummy', foo: 'bar' };

            const first = await useCase.execute(entities, userId, config);
            integrationRepository.clearHistory();

            const second = await useCase.execute(entities, userId, config);

            expect(second.id).toBe(first.id);

            const history = integrationRepository.getOperationHistory();
            expect(history.some((op) => op.operation === 'create')).toBe(false);
            expect(
                history.find((op) => op.operation === 'findByUserIdTypeAndEntities'),
            ).toMatchObject({ userId, type: 'dummy', found: true });
        });

        it('runs testAuth on the reused integration so stale credentials surface', async () => {
            const entities = ['entity-1'];
            const userId = 'user-1';
            const config = { type: 'dummy' };

            const testAuthSpy = jest.fn();
            const integrationClass = class extends DummyIntegration {
                async testAuth() {
                    testAuthSpy();
                }
            };
            Object.defineProperty(integrationClass, 'Definition', {
                value: DummyIntegration.Definition,
            });

            const localUseCase = new CreateIntegration({
                integrationRepository,
                integrationClasses: [integrationClass],
                moduleFactory,
            });

            await localUseCase.execute(entities, userId, config);
            await localUseCase.execute(entities, userId, config);

            expect(testAuthSpy).toHaveBeenCalledTimes(1);
        });

        it('ignores entity order when checking for duplicates', async () => {
            const userId = 'user-1';
            const config = { type: 'dummy' };

            const first = await useCase.execute(['entity-1', 'entity-2'], userId, config);
            const second = await useCase.execute(['entity-2', 'entity-1'], userId, config);

            expect(second.id).toBe(first.id);
        });

        it('creates a new integration when the type differs', async () => {
            const entities = ['entity-1'];
            const userId = 'user-1';

            const dummyTwoClass = class extends DummyIntegration {};
            Object.defineProperty(dummyTwoClass, 'Definition', {
                value: { ...DummyIntegration.Definition, name: 'dummy-two' },
            });
            const localUseCase = new CreateIntegration({
                integrationRepository,
                integrationClasses: [DummyIntegration, dummyTwoClass],
                moduleFactory,
            });

            const first = await localUseCase.execute(entities, userId, { type: 'dummy' });
            const second = await localUseCase.execute(entities, userId, { type: 'dummy-two' });

            expect(second.id).not.toBe(first.id);
        });

        it('creates a new integration when the entity set differs', async () => {
            const userId = 'user-1';
            const config = { type: 'dummy' };

            const first = await useCase.execute(['entity-1'], userId, config);
            const second = await useCase.execute(['entity-1', 'entity-2'], userId, config);

            expect(second.id).not.toBe(first.id);
        });

        it('creates a new integration when the userId differs', async () => {
            const entities = ['entity-1'];
            const config = { type: 'dummy' };

            const first = await useCase.execute(entities, 'user-1', config);
            const second = await useCase.execute(entities, 'user-2', config);

            expect(second.id).not.toBe(first.id);
        });
    });
}); 