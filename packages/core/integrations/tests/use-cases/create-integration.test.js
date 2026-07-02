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
const { IntegrationBase } = require('../../integration-base');

function makeFirstLookupStale(repository) {
    const realFind = repository.findIntegrationsByUserId.bind(repository);
    let first = true;
    repository.findIntegrationsByUserId = async (userId) => {
        if (first) {
            first = false;
            return [];
        }
        return realFind(userId);
    };
}

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
            const userId = 'user-dedupe-1';
            const config = { type: 'dummy', foo: 'bar' };

            const first = await useCase.execute(entities, userId, config);
            integrationRepository.clearHistory();

            const second = await useCase.execute(entities, userId, config);

            expect(second.id).toBe(first.id);
            const history = integrationRepository.getOperationHistory();
            expect(history.some((op) => op.operation === 'create')).toBe(false);
            expect(history.find((op) => op.operation === 'findByUserId')).toMatchObject({
                userId,
                count: 1,
            });
        });

        it('runs testAuth on the reused integration so stale credentials surface', async () => {
            const testAuthCalls = [];
            class TrackingIntegration extends DummyIntegration {
                async testAuth() {
                    testAuthCalls.push(this.id);
                }
            }
            const trackingUseCase = new CreateIntegration({
                integrationRepository,
                integrationClasses: [TrackingIntegration],
                moduleFactory,
            });
            const entities = ['entity-1'];
            const userId = 'user-dedupe-2';
            const config = { type: 'dummy' };

            await trackingUseCase.execute(entities, userId, config);
            await trackingUseCase.execute(entities, userId, config);

            expect(testAuthCalls).toHaveLength(1);
        });

        it('ignores entity order when checking for duplicates', async () => {
            const userId = 'user-dedupe-3';
            const config = { type: 'dummy' };

            const first = await useCase.execute(['entity-1', 'entity-2'], userId, config);
            const second = await useCase.execute(['entity-2', 'entity-1'], userId, config);

            expect(second.id).toBe(first.id);
        });

        it('creates a new integration when the type differs', async () => {
            class OtherIntegration extends DummyIntegration {
                static Definition = { ...DummyIntegration.Definition, name: 'other-dummy' };
            }
            const useCaseWithBoth = new CreateIntegration({
                integrationRepository,
                integrationClasses: [DummyIntegration, OtherIntegration],
                moduleFactory,
            });
            const entities = ['entity-1'];
            const userId = 'user-dedupe-4';

            const first = await useCaseWithBoth.execute(entities, userId, { type: 'dummy' });
            const second = await useCaseWithBoth.execute(entities, userId, { type: 'other-dummy' });

            expect(second.id).not.toBe(first.id);
        });

        it('creates a new integration when the entity set differs', async () => {
            const userId = 'user-dedupe-5';
            const config = { type: 'dummy' };

            const first = await useCase.execute(['entity-1'], userId, config);
            const second = await useCase.execute(['entity-1', 'entity-2'], userId, config);

            expect(second.id).not.toBe(first.id);
        });

        it('creates a new integration when the userId differs', async () => {
            const entities = ['entity-1'];
            const config = { type: 'dummy' };

            const first = await useCase.execute(entities, 'user-dedupe-6a', config);
            const second = await useCase.execute(entities, 'user-dedupe-6b', config);

            expect(second.id).not.toBe(first.id);
        });

        it('reuses the oldest of multiple pre-existing legacy duplicate integrations', async () => {
            const entities = ['entity-1'];
            const userId = 'user-dedupe-7';
            const config = { type: 'dummy' };

            const older = await integrationRepository.createIntegration(entities, userId, config);
            const olderRecord = await integrationRepository.findIntegrationById(older.id);
            olderRecord.createdAt = new Date(Date.now() - 60_000);
            await integrationRepository.createIntegration(entities, userId, config);
            integrationRepository.clearHistory();

            const dto = await useCase.execute(entities, userId, config);

            expect(dto.id).toBe(older.id);
            const history = integrationRepository.getOperationHistory();
            expect(history.some((op) => op.operation === 'create')).toBe(false);
        });

        it('heals a reused integration from ERROR to ENABLED when credentials are valid again', async () => {
            class RealAuthIntegration extends DummyIntegration {
                testAuth() {
                    return IntegrationBase.prototype.testAuth.call(this);
                }
            }
            class HealingModuleFactory {
                async getModuleInstance(entityId, userId) {
                    return {
                        getName: () => 'dummy',
                        api: {},
                        entityId,
                        userId,
                        testAuth: jest.fn().mockResolvedValue(true),
                    };
                }
            }
            const healingUseCase = new CreateIntegration({
                integrationRepository,
                integrationClasses: [RealAuthIntegration],
                moduleFactory: new HealingModuleFactory(),
            });
            const entities = ['entity-1'];
            const userId = 'user-heal-1';
            const config = { type: 'dummy' };

            const created = await healingUseCase.execute(entities, userId, config);
            const record = await integrationRepository.findIntegrationById(created.id);
            record.status = 'ERROR';

            const reused = await healingUseCase.execute(entities, userId, config);

            expect(reused.id).toBe(created.id);
            expect(reused.status).toBe('ENABLED');
        });
    });

    describe('creation race backstop', () => {
        it('deletes the just-created row and returns the older competitor when the initial lookup was stale', async () => {
            const entities = ['entity-1'];
            const userId = 'user-race-1';
            const config = { type: 'dummy' };

            const first = await useCase.execute(entities, userId, config);
            const firstRecord = await integrationRepository.findIntegrationById(first.id);
            firstRecord.createdAt = new Date(Date.now() - 60_000);
            integrationRepository.clearHistory();
            makeFirstLookupStale(integrationRepository);

            const second = await useCase.execute(entities, userId, config);

            expect(second.id).toBe(first.id);
            const history = integrationRepository.getOperationHistory();
            const createOp = history.find((op) => op.operation === 'create');
            expect(createOp).toBeDefined();
            expect(history.find((op) => op.operation === 'delete')).toMatchObject({
                id: createOp.id,
                existed: true,
                success: true,
            });
            expect(await integrationRepository.findIntegrationById(createOp.id)).toBeNull();
        });

        it('fires ON_CREATE exactly once across both racers', async () => {
            const sendEvents = [];
            class TrackingIntegration extends DummyIntegration {
                async send(event, data) {
                    sendEvents.push(event);
                    return super.send(event, data);
                }
            }
            const trackingUseCase = new CreateIntegration({
                integrationRepository,
                integrationClasses: [TrackingIntegration],
                moduleFactory,
            });
            const entities = ['entity-1'];
            const userId = 'user-race-2';
            const config = { type: 'dummy' };

            const first = await trackingUseCase.execute(entities, userId, config);
            const firstRecord = await integrationRepository.findIntegrationById(first.id);
            firstRecord.createdAt = new Date(Date.now() - 60_000);
            makeFirstLookupStale(integrationRepository);

            await trackingUseCase.execute(entities, userId, config);

            expect(sendEvents.filter((event) => event === 'ON_CREATE')).toHaveLength(1);
        });

        it('runs testAuth on the survivor when losing the race', async () => {
            const testAuthCalls = [];
            class TrackingIntegration extends DummyIntegration {
                async testAuth() {
                    testAuthCalls.push(this.id);
                }
            }
            const trackingUseCase = new CreateIntegration({
                integrationRepository,
                integrationClasses: [TrackingIntegration],
                moduleFactory,
            });
            const entities = ['entity-1'];
            const userId = 'user-race-3';
            const config = { type: 'dummy' };

            const first = await trackingUseCase.execute(entities, userId, config);
            const firstRecord = await integrationRepository.findIntegrationById(first.id);
            firstRecord.createdAt = new Date(Date.now() - 60_000);
            makeFirstLookupStale(integrationRepository);

            await trackingUseCase.execute(entities, userId, config);

            expect(testAuthCalls).toEqual([first.id]);
        });

        it('keeps its own row when it is the deterministic winner despite a stale initial lookup', async () => {
            const entities = ['entity-1'];
            const userId = 'user-race-4';
            const config = { type: 'dummy' };

            const competitor = await useCase.execute(entities, userId, config);
            const competitorRecord = await integrationRepository.findIntegrationById(competitor.id);
            competitorRecord.createdAt = new Date(Date.now() + 60_000);
            integrationRepository.clearHistory();
            makeFirstLookupStale(integrationRepository);

            const dto = await useCase.execute(entities, userId, config);

            expect(dto.id).not.toBe(competitor.id);
            const history = integrationRepository.getOperationHistory();
            expect(history.some((op) => op.operation === 'delete')).toBe(false);
        });
    });
});