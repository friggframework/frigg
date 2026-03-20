jest.mock('../../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
}));

import { CreateIntegration } from '../../use-cases/create-integration';
import { TestIntegrationRepository } from '../doubles/test-integration-repository';
import { TestModuleFactory } from '../../../modules/tests/doubles/test-module-factory';
import { DummyIntegration } from '../doubles/dummy-integration-class';

describe('CreateIntegration Use-Case', () => {
    let integrationRepository: InstanceType<typeof TestIntegrationRepository>;
    let moduleFactory: InstanceType<typeof TestModuleFactory>;
    let useCase: InstanceType<typeof CreateIntegration>;

    beforeEach(() => {
        integrationRepository = new TestIntegrationRepository();
        moduleFactory = new TestModuleFactory();
        useCase = new CreateIntegration({
            integrationRepository,
            integrationClasses: [DummyIntegration],
            moduleFactory,
        } as any);
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
            const createOperation = history.find((op: any) => op.operation === 'create');
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
            } as any);

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
            const entities: string[] = [];
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
});
