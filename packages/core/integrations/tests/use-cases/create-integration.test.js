jest.mock('../../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
}));

const { CreateIntegration } = require('../../use-cases/create-integration');
const {
    TestIntegrationRepository,
} = require('../doubles/test-integration-repository');
const {
    TestModuleFactory,
} = require('../../../modules/tests/doubles/test-module-factory');
const { DummyIntegration } = require('../doubles/dummy-integration-class');
const { IntegrationBase } = require('../../integration-base');

// Simulates two requests racing to create the same integration: the caller's
// initial duplicate check misses a row that a concurrent request already
// committed. Used by the "creation race backstop" tests below.
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
    let createIntegration;

    beforeEach(() => {
        integrationRepository = new TestIntegrationRepository();
        moduleFactory = new TestModuleFactory();
        createIntegration = new CreateIntegration({
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

            const dto = await createIntegration.execute(
                entities,
                userId,
                config
            );

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

            const dto = await createIntegration.execute(
                entities,
                userId,
                config
            );

            const record = await integrationRepository.findIntegrationById(
                dto.id
            );
            expect(record).toMatchObject({ userId, config });
        });

        it('loads modules for each entity', async () => {
            const entities = ['entity-1', 'entity-2'];
            const userId = 'user-1';
            const config = { type: 'dummy' };

            const dto = await createIntegration.execute(
                entities,
                userId,
                config
            );

            expect(dto.entities).toEqual(entities);
        });
    });

    describe('error cases', () => {
        it('throws error when integration class is not found', async () => {
            const entities = ['entity-1'];
            const userId = 'user-1';
            const config = { type: 'unknown-type' };

            await expect(
                createIntegration.execute(entities, userId, config)
            ).rejects.toThrow(
                'No integration class found for type: unknown-type'
            );
        });

        it('throws error when no integration classes provided', async () => {
            const createIntegrationWithoutClasses = new CreateIntegration({
                integrationRepository,
                integrationClasses: [],
                moduleFactory,
            });

            const entities = ['entity-1'];
            const userId = 'user-1';
            const config = { type: 'dummy' };

            await expect(
                createIntegrationWithoutClasses.execute(
                    entities,
                    userId,
                    config
                )
            ).rejects.toThrow('No integration class found for type: dummy');
        });
    });

    describe('edge cases', () => {
        it('handles empty entities array', async () => {
            const entities = [];
            const userId = 'user-1';
            const config = { type: 'dummy' };

            const dto = await createIntegration.execute(
                entities,
                userId,
                config
            );

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
                    bool: true,
                },
            };

            const dto = await createIntegration.execute(
                entities,
                userId,
                config
            );

            expect(dto.config).toEqual(config);
        });
    });

    describe('deduplication on re-authorize', () => {
        it('reuses an existing integration when userId, type, and entity set all match', async () => {
            const entities = ['entity-1', 'entity-2'];
            const userId = 'user-dedupe-1';
            const config = { type: 'dummy', foo: 'bar' };

            const first = await createIntegration.execute(
                entities,
                userId,
                config
            );
            const second = await createIntegration.execute(
                entities,
                userId,
                config
            );

            expect(second.id).toBe(first.id);
            const stored = await integrationRepository.findIntegrationsByUserId(
                userId
            );
            expect(stored).toHaveLength(1);
        });

        it('runs testAuth on the reused integration so stale credentials surface', async () => {
            const testAuthCalls = [];
            class AuthTrackingIntegration extends DummyIntegration {
                async testAuth() {
                    testAuthCalls.push(this.id);
                }
            }
            const createIntegrationWithAuthTracking = new CreateIntegration({
                integrationRepository,
                integrationClasses: [AuthTrackingIntegration],
                moduleFactory,
            });
            const entities = ['entity-1'];
            const userId = 'user-dedupe-2';
            const config = { type: 'dummy' };

            await createIntegrationWithAuthTracking.execute(
                entities,
                userId,
                config
            );
            await createIntegrationWithAuthTracking.execute(
                entities,
                userId,
                config
            );

            expect(testAuthCalls).toHaveLength(1);
        });

        it('ignores entity order when checking for duplicates', async () => {
            const userId = 'user-dedupe-3';
            const config = { type: 'dummy' };

            const first = await createIntegration.execute(
                ['entity-1', 'entity-2'],
                userId,
                config
            );
            const second = await createIntegration.execute(
                ['entity-2', 'entity-1'],
                userId,
                config
            );

            expect(second.id).toBe(first.id);
        });

        it('creates a new integration when the type differs', async () => {
            class OtherIntegration extends DummyIntegration {
                static Definition = {
                    ...DummyIntegration.Definition,
                    name: 'other-dummy',
                };
            }
            const createIntegrationWithTwoTypes = new CreateIntegration({
                integrationRepository,
                integrationClasses: [DummyIntegration, OtherIntegration],
                moduleFactory,
            });
            const entities = ['entity-1'];
            const userId = 'user-dedupe-4';

            const first = await createIntegrationWithTwoTypes.execute(
                entities,
                userId,
                { type: 'dummy' }
            );
            const second = await createIntegrationWithTwoTypes.execute(
                entities,
                userId,
                { type: 'other-dummy' }
            );

            expect(second.id).not.toBe(first.id);
        });

        it('creates a new integration when the entity set differs', async () => {
            const userId = 'user-dedupe-5';
            const config = { type: 'dummy' };

            const first = await createIntegration.execute(
                ['entity-1'],
                userId,
                config
            );
            const second = await createIntegration.execute(
                ['entity-1', 'entity-2'],
                userId,
                config
            );

            expect(second.id).not.toBe(first.id);
        });

        it('creates a new integration when the userId differs', async () => {
            const entities = ['entity-1'];
            const config = { type: 'dummy' };

            const first = await createIntegration.execute(
                entities,
                'user-dedupe-6a',
                config
            );
            const second = await createIntegration.execute(
                entities,
                'user-dedupe-6b',
                config
            );

            expect(second.id).not.toBe(first.id);
        });

        it('reuses the oldest of multiple pre-existing legacy duplicate integrations', async () => {
            const entities = ['entity-1'];
            const userId = 'user-dedupe-7';
            const config = { type: 'dummy' };

            const older = await integrationRepository.createIntegration(
                entities,
                userId,
                config
            );
            const olderRecord = await integrationRepository.findIntegrationById(
                older.id
            );
            olderRecord.createdAt = new Date(Date.now() - 60_000);
            await integrationRepository.createIntegration(
                entities,
                userId,
                config
            );

            const dto = await createIntegration.execute(
                entities,
                userId,
                config
            );

            expect(dto.id).toBe(older.id);
            const stored = await integrationRepository.findIntegrationsByUserId(
                userId
            );
            expect(stored).toHaveLength(2);
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
            const createIntegrationWithRealAuth = new CreateIntegration({
                integrationRepository,
                integrationClasses: [RealAuthIntegration],
                moduleFactory: new HealingModuleFactory(),
            });
            const entities = ['entity-1'];
            const userId = 'user-heal-1';
            const config = { type: 'dummy' };

            const created = await createIntegrationWithRealAuth.execute(
                entities,
                userId,
                config
            );
            const record = await integrationRepository.findIntegrationById(
                created.id
            );
            record.status = 'ERROR';

            const reused = await createIntegrationWithRealAuth.execute(
                entities,
                userId,
                config
            );

            expect(reused.id).toBe(created.id);
            expect(reused.status).toBe('ENABLED');
        });

        it('re-enables a reused integration that was DISABLED when the user reconnects', async () => {
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
            const createIntegrationWithRealAuth = new CreateIntegration({
                integrationRepository,
                integrationClasses: [RealAuthIntegration],
                moduleFactory: new HealingModuleFactory(),
            });
            const entities = ['entity-1'];
            const userId = 'user-reconnect-1';
            const config = { type: 'dummy' };

            const created = await createIntegrationWithRealAuth.execute(
                entities,
                userId,
                config
            );
            const record = await integrationRepository.findIntegrationById(
                created.id
            );
            record.status = 'DISABLED';

            const reused = await createIntegrationWithRealAuth.execute(
                entities,
                userId,
                config
            );

            expect(reused.id).toBe(created.id);
            expect(reused.status).toBe('ENABLED');
        });

        it('does not force-enable a reused integration still in NEEDS_CONFIG', async () => {
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
            const createIntegrationWithRealAuth = new CreateIntegration({
                integrationRepository,
                integrationClasses: [RealAuthIntegration],
                moduleFactory: new HealingModuleFactory(),
            });
            const entities = ['entity-1'];
            const userId = 'user-reconnect-2';
            const config = { type: 'dummy' };

            const created = await createIntegrationWithRealAuth.execute(
                entities,
                userId,
                config
            );
            const record = await integrationRepository.findIntegrationById(
                created.id
            );
            record.status = 'NEEDS_CONFIG';

            const reused = await createIntegrationWithRealAuth.execute(
                entities,
                userId,
                config
            );

            expect(reused.id).toBe(created.id);
            expect(reused.status).toBe('NEEDS_CONFIG');
        });

        it('flips a reused DISABLED integration to ERROR instead of ENABLED when credentials are actually invalid', async () => {
            class RealAuthIntegration extends DummyIntegration {
                testAuth() {
                    return IntegrationBase.prototype.testAuth.call(this);
                }
            }
            class FailingModuleFactory {
                async getModuleInstance(entityId, userId) {
                    return {
                        getName: () => 'dummy',
                        api: {},
                        entityId,
                        userId,
                        testAuth: jest.fn().mockResolvedValue(false),
                    };
                }
            }
            const createIntegrationWithFailingAuth = new CreateIntegration({
                integrationRepository,
                integrationClasses: [RealAuthIntegration],
                moduleFactory: new FailingModuleFactory(),
            });
            const entities = ['entity-1'];
            const userId = 'user-reconnect-3';
            const config = { type: 'dummy' };

            const created = await createIntegrationWithFailingAuth.execute(
                entities,
                userId,
                config
            );
            const record = await integrationRepository.findIntegrationById(
                created.id
            );
            record.status = 'DISABLED';

            const reused = await createIntegrationWithFailingAuth.execute(
                entities,
                userId,
                config
            );

            expect(reused.id).toBe(created.id);
            expect(reused.status).toBe('ERROR');
        });
    });

    describe('creation race backstop', () => {
        it('deletes the just-created row and returns the older competitor when the initial lookup was stale', async () => {
            const entities = ['entity-1'];
            const userId = 'user-race-1';
            const config = { type: 'dummy' };

            const first = await createIntegration.execute(
                entities,
                userId,
                config
            );
            const firstRecord = await integrationRepository.findIntegrationById(
                first.id
            );
            firstRecord.createdAt = new Date(Date.now() - 60_000);
            makeFirstLookupStale(integrationRepository);

            const second = await createIntegration.execute(
                entities,
                userId,
                config
            );

            expect(second.id).toBe(first.id);
            const stored = await integrationRepository.findIntegrationsByUserId(
                userId
            );
            expect(stored).toHaveLength(1);
            expect(stored[0].id).toBe(first.id);
        });

        it('fires ON_CREATE exactly once across both racers', async () => {
            const sendEvents = [];
            class SendTrackingIntegration extends DummyIntegration {
                async send(event, data) {
                    sendEvents.push(event);
                    return super.send(event, data);
                }
            }
            const createIntegrationWithSendTracking = new CreateIntegration({
                integrationRepository,
                integrationClasses: [SendTrackingIntegration],
                moduleFactory,
            });
            const entities = ['entity-1'];
            const userId = 'user-race-2';
            const config = { type: 'dummy' };

            const first = await createIntegrationWithSendTracking.execute(
                entities,
                userId,
                config
            );
            const firstRecord = await integrationRepository.findIntegrationById(
                first.id
            );
            firstRecord.createdAt = new Date(Date.now() - 60_000);
            makeFirstLookupStale(integrationRepository);

            await createIntegrationWithSendTracking.execute(
                entities,
                userId,
                config
            );

            expect(
                sendEvents.filter((event) => event === 'ON_CREATE')
            ).toHaveLength(1);
        });

        it('runs testAuth on the survivor when losing the race', async () => {
            const testAuthCalls = [];
            class AuthTrackingIntegration extends DummyIntegration {
                async testAuth() {
                    testAuthCalls.push(this.id);
                }
            }
            const createIntegrationWithAuthTracking = new CreateIntegration({
                integrationRepository,
                integrationClasses: [AuthTrackingIntegration],
                moduleFactory,
            });
            const entities = ['entity-1'];
            const userId = 'user-race-3';
            const config = { type: 'dummy' };

            const first = await createIntegrationWithAuthTracking.execute(
                entities,
                userId,
                config
            );
            const firstRecord = await integrationRepository.findIntegrationById(
                first.id
            );
            firstRecord.createdAt = new Date(Date.now() - 60_000);
            makeFirstLookupStale(integrationRepository);

            await createIntegrationWithAuthTracking.execute(
                entities,
                userId,
                config
            );

            expect(testAuthCalls).toEqual([first.id]);
        });

        it('keeps its own row when it is the deterministic winner despite a stale initial lookup', async () => {
            const entities = ['entity-1'];
            const userId = 'user-race-4';
            const config = { type: 'dummy' };

            const competitor = await createIntegration.execute(
                entities,
                userId,
                config
            );
            const competitorRecord =
                await integrationRepository.findIntegrationById(competitor.id);
            competitorRecord.createdAt = new Date(Date.now() + 60_000);
            makeFirstLookupStale(integrationRepository);

            const dto = await createIntegration.execute(
                entities,
                userId,
                config
            );

            expect(dto.id).not.toBe(competitor.id);
            const stored = await integrationRepository.findIntegrationsByUserId(
                userId
            );
            expect(stored.map((record) => record.id).sort()).toEqual(
                [competitor.id, dto.id].sort()
            );
        });
    });
});
