const { GetIntegrationsForUser } = require('../../use-cases/get-integrations-for-user');
const { TestIntegrationRepository } = require('../doubles/test-integration-repository');
const { TestModuleFactory } = require('../../../modules/tests/doubles/test-module-factory');
const { TestModuleRepository } = require('../../../modules/tests/doubles/test-module-repository');
const { DummyIntegration } = require('../doubles/dummy-integration-class');

describe('GetIntegrationsForUser Use-Case', () => {
    let integrationRepository;
    let moduleRepository;
    let moduleFactory;
    let useCase;

    beforeEach(() => {
        integrationRepository = new TestIntegrationRepository();
        moduleRepository = new TestModuleRepository();
        moduleFactory = new TestModuleFactory();
        useCase = new GetIntegrationsForUser({
            integrationRepository,
            integrationClasses: [DummyIntegration],
            moduleFactory,
            moduleRepository,
        });
    });

    describe('happy path', () => {
        it('returns integrations dto list for single user', async () => {
            const entity = { id: 'entity-1' };
            moduleRepository.addEntity(entity);

            await integrationRepository.createIntegration([entity.id], 'user-1', { type: 'dummy' });

            const list = await useCase.execute('user-1');
            expect(list.length).toBe(1);
            expect(list[0].config.type).toBe('dummy');
            expect(list[0].userId).toBe('user-1');
        });

        it('returns multiple integrations for same user', async () => {
            const entity1 = { id: 'entity-1' };
            const entity2 = { id: 'entity-2' };
            moduleRepository.addEntity(entity1);
            moduleRepository.addEntity(entity2);

            await integrationRepository.createIntegration([entity1.id], 'user-1', { type: 'dummy', name: 'first' });
            await integrationRepository.createIntegration([entity2.id], 'user-1', { type: 'dummy', name: 'second' });

            const list = await useCase.execute('user-1');
            expect(list.length).toBe(2);
            expect(list[0].config.name).toBe('first');
            expect(list[1].config.name).toBe('second');
        });

        it('filters integrations by user correctly', async () => {
            const entity1 = { id: 'entity-1' };
            const entity2 = { id: 'entity-2' };
            moduleRepository.addEntity(entity1);
            moduleRepository.addEntity(entity2);

            await integrationRepository.createIntegration([entity1.id], 'user-1', { type: 'dummy', owner: 'user1' });
            await integrationRepository.createIntegration([entity2.id], 'user-2', { type: 'dummy', owner: 'user2' });

            const user1List = await useCase.execute('user-1');
            const user2List = await useCase.execute('user-2');

            expect(user1List.length).toBe(1);
            expect(user2List.length).toBe(1);
            expect(user1List[0].config.owner).toBe('user1');
            expect(user2List[0].config.owner).toBe('user2');
        });

        it('returns empty array when user has no integrations', async () => {
            const entity = { id: 'entity-1' };
            moduleRepository.addEntity(entity);

            await integrationRepository.createIntegration([entity.id], 'user-1', { type: 'dummy' });

            const list = await useCase.execute('user-2');
            expect(list).toEqual([]);
        });

        it('tracks repository operations', async () => {
            const entity = { id: 'entity-1' };
            moduleRepository.addEntity(entity);
            await integrationRepository.createIntegration([entity.id], 'user-1', { type: 'dummy' });
            integrationRepository.clearHistory();

            await useCase.execute('user-1');

            const history = integrationRepository.getOperationHistory();
            const findOperation = history.find(op => op.operation === 'findByUserId');
            expect(findOperation).toEqual({
                operation: 'findByUserId',
                userId: 'user-1',
                count: 1
            });
        });
    });

    describe('error cases', () => {
        it('throws error when integration class not found', async () => {
            const useCaseWithoutClasses = new GetIntegrationsForUser({
                integrationRepository,
                integrationClasses: [],
                moduleFactory,
                moduleRepository,
            });

            const entity = { id: 'entity-1' };
            moduleRepository.addEntity(entity);
            await integrationRepository.createIntegration([entity.id], 'user-1', { type: 'dummy' });

            await expect(useCaseWithoutClasses.execute('user-1'))
                .rejects
                .toThrow();
        });

        it('handles missing entities gracefully', async () => {
            await integrationRepository.createIntegration(['missing-entity'], 'user-1', { type: 'dummy' });

            await expect(useCase.execute('user-1'))
                .rejects
                .toThrow();
        });
    });

    describe('edge cases', () => {
        it('handles user with null/undefined userId', async () => {
            const list1 = await useCase.execute(null);
            const list2 = await useCase.execute(undefined);

            expect(list1).toEqual([]);
            expect(list2).toEqual([]);
        });

        it('handles integrations with complex configs', async () => {
            const entity = { id: 'entity-1' };
            moduleRepository.addEntity(entity);

            const complexConfig = {
                type: 'dummy',
                settings: {
                    nested: { deep: 'value' },
                    array: [1, 2, 3],
                    boolean: true,
                    nullValue: null
                }
            };

            await integrationRepository.createIntegration([entity.id], 'user-1', complexConfig);

            const list = await useCase.execute('user-1');
            expect(list[0].config).toEqual(complexConfig);
        });

        it('handles integrations with multiple entities', async () => {
            const entity1 = { id: 'entity-1' };
            const entity2 = { id: 'entity-2' };
            const entity3 = { id: 'entity-3' };
            moduleRepository.addEntity(entity1);
            moduleRepository.addEntity(entity2);
            moduleRepository.addEntity(entity3);

            await integrationRepository.createIntegration([entity1.id, entity2.id, entity3.id], 'user-1', { type: 'dummy' });

            const list = await useCase.execute('user-1');
            expect(list[0].entities).toEqual([entity1, entity2, entity3]);
        });
    });
}); 