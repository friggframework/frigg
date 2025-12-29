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
const {
    DummyIntegration,
    DummyIntegrationWithGlobalEntity,
    DummyIntegrationWithOptionalGlobalEntity,
} = require('../doubles/dummy-integration-class');

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

            const record = await integrationRepository.findIntegrationById(
                dto.id
            );
            expect(record).toBeTruthy();

            const history = integrationRepository.getOperationHistory();
            const createOperation = history.find(
                (op) => op.operation === 'create'
            );
            expect(createOperation).toEqual({
                operation: 'create',
                id: dto.id,
                userId,
                config,
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

            await expect(
                useCase.execute(entities, userId, config)
            ).rejects.toThrow(
                'No integration class found for type: unknown-type'
            );
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

            await expect(
                useCaseWithoutClasses.execute(entities, userId, config)
            ).rejects.toThrow('No integration class found for type: dummy');
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
                    bool: true,
                },
            };

            const dto = await useCase.execute(entities, userId, config);

            expect(dto.config).toEqual(config);
        });
    });

    describe('global entities', () => {
        let useCaseWithGlobal;

        beforeEach(() => {
            useCaseWithGlobal = new CreateIntegration({
                integrationRepository,
                integrationClasses: [
                    DummyIntegration,
                    DummyIntegrationWithGlobalEntity,
                    DummyIntegrationWithOptionalGlobalEntity,
                ],
                moduleFactory,
            });
        });

        it('auto-includes global entity when found with valid credential', async () => {
            const mockGlobalEntity = {
                id: 'global-entity-123',
                moduleName: 'shared-api',
                isGlobal: true,
                credential: { authIsValid: true },
            };
            moduleFactory.moduleRepository.findEntity.mockResolvedValue(mockGlobalEntity);

            const dto = await useCaseWithGlobal.execute(
                ['user-entity-1'],
                'user-1',
                { type: 'dummy-with-global' }
            );

            expect(moduleFactory.moduleRepository.findEntity).toHaveBeenCalledWith({
                moduleName: 'shared-api',
                isGlobal: true,
            });
            expect(dto.entities).toContain('global-entity-123');
            expect(dto.entities).toHaveLength(2);
        });

        it('throws error when required global entity not found', async () => {
            moduleFactory.moduleRepository.findEntity.mockResolvedValue(null);

            await expect(
                useCaseWithGlobal.execute(
                    ['user-entity-1'],
                    'user-1',
                    { type: 'dummy-with-global' }
                )
            ).rejects.toThrow(
                'Required global entity "shared-api" not found. Admin must configure this entity first.'
            );
        });

        it('throws error when global entity has invalid credential', async () => {
            const mockGlobalEntity = {
                id: 'global-entity-123',
                moduleName: 'shared-api',
                isGlobal: true,
                credential: { authIsValid: false },
            };
            moduleFactory.moduleRepository.findEntity.mockResolvedValue(mockGlobalEntity);

            await expect(
                useCaseWithGlobal.execute(
                    ['user-entity-1'],
                    'user-1',
                    { type: 'dummy-with-global' }
                )
            ).rejects.toThrow(
                'Required global entity "shared-api" exists but credential is invalid. Admin must configure this entity first.'
            );
        });

        it('skips optional global entity when not found', async () => {
            moduleFactory.moduleRepository.findEntity.mockResolvedValue(null);

            const dto = await useCaseWithGlobal.execute(
                ['user-entity-1'],
                'user-1',
                { type: 'dummy-with-optional-global' }
            );

            expect(dto.entities).toEqual(['user-entity-1']);
            expect(dto.entities).toHaveLength(1);
        });

        it('skips optional global entity with invalid credential', async () => {
            const mockGlobalEntity = {
                id: 'global-entity-123',
                moduleName: 'optional-api',
                isGlobal: true,
                credential: { authIsValid: false },
            };
            moduleFactory.moduleRepository.findEntity.mockResolvedValue(mockGlobalEntity);

            const dto = await useCaseWithGlobal.execute(
                ['user-entity-1'],
                'user-1',
                { type: 'dummy-with-optional-global' }
            );

            expect(dto.entities).toEqual(['user-entity-1']);
        });
    });
});
