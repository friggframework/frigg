const {
    FindIntegrationContextByExternalEntityIdUseCase,
} = require('./find-integration-context-by-external-entity-id');

describe('FindIntegrationContextByExternalEntityIdUseCase', () => {
    let useCase;
    let mockIntegrationRepository;
    let mockModuleRepository;
    let mockLoadIntegrationContextUseCase;

    beforeEach(() => {
        mockIntegrationRepository = {
            findIntegrationsByEntityId: jest.fn(),
        };
        mockModuleRepository = {
            findEntity: jest.fn(),
        };
        mockLoadIntegrationContextUseCase = {
            execute: jest.fn(),
        };

        useCase = new FindIntegrationContextByExternalEntityIdUseCase({
            integrationRepository: mockIntegrationRepository,
            moduleRepository: mockModuleRepository,
            loadIntegrationContextUseCase: mockLoadIntegrationContextUseCase,
        });
    });

    describe('constructor', () => {
        it('throws if integrationRepository is not provided', () => {
            expect(
                () =>
                    new FindIntegrationContextByExternalEntityIdUseCase({
                        moduleRepository: mockModuleRepository,
                        loadIntegrationContextUseCase:
                            mockLoadIntegrationContextUseCase,
                    })
            ).toThrow('integrationRepository is required');
        });

        it('throws if moduleRepository is not provided', () => {
            expect(
                () =>
                    new FindIntegrationContextByExternalEntityIdUseCase({
                        integrationRepository: mockIntegrationRepository,
                        loadIntegrationContextUseCase:
                            mockLoadIntegrationContextUseCase,
                    })
            ).toThrow('moduleRepository is required');
        });

        it('throws if loadIntegrationContextUseCase is not provided', () => {
            expect(
                () =>
                    new FindIntegrationContextByExternalEntityIdUseCase({
                        integrationRepository: mockIntegrationRepository,
                        moduleRepository: mockModuleRepository,
                    })
            ).toThrow('loadIntegrationContextUseCase is required');
        });
    });

    describe('execute', () => {
        it('throws if externalId is not provided', async () => {
            await expect(
                useCase.execute({ type: 'slack' })
            ).rejects.toMatchObject({
                message: 'externalId is required',
                code: 'EXTERNAL_ID_REQUIRED',
            });
        });

        it('throws if type is not provided', async () => {
            await expect(
                useCase.execute({ externalId: 'ext-123' })
            ).rejects.toMatchObject({
                message: 'type is required',
                code: 'TYPE_REQUIRED',
            });
        });

        it('throws if entity is not found', async () => {
            mockModuleRepository.findEntity.mockResolvedValue(null);

            await expect(
                useCase.execute({ externalId: 'ext-123', type: 'slack' })
            ).rejects.toMatchObject({
                message: 'Entity not found for externalId: ext-123',
                code: 'ENTITY_NOT_FOUND',
            });
        });

        it('throws if no integration of matching type is found', async () => {
            const mockEntity = { id: 'entity-123', externalId: 'ext-123' };
            mockModuleRepository.findEntity.mockResolvedValue(mockEntity);
            mockIntegrationRepository.findIntegrationsByEntityId.mockResolvedValue(
                [{ id: 'integration-1', config: { type: 'hubspot' } }]
            );

            await expect(
                useCase.execute({ externalId: 'ext-123', type: 'slack' })
            ).rejects.toMatchObject({
                message:
                    "Integration of type 'slack' not found for entity: entity-123",
                code: 'INTEGRATION_NOT_FOUND',
            });
        });

        it('throws if no integrations exist for entity', async () => {
            const mockEntity = { id: 'entity-123', externalId: 'ext-123' };
            mockModuleRepository.findEntity.mockResolvedValue(mockEntity);
            mockIntegrationRepository.findIntegrationsByEntityId.mockResolvedValue(
                []
            );

            await expect(
                useCase.execute({ externalId: 'ext-123', type: 'slack' })
            ).rejects.toMatchObject({
                message:
                    "Integration of type 'slack' not found for entity: entity-123",
                code: 'INTEGRATION_NOT_FOUND',
            });
        });

        it('finds integration by entity binding and type', async () => {
            const mockEntity = {
                id: 'entity-123',
                externalId: 'ext-123',
                userId: 'user-456',
            };
            const mockIntegration = {
                id: 'integration-789',
                config: { type: 'slack' },
                entities: ['entity-123'],
            };
            const mockContext = { integration: mockIntegration };

            mockModuleRepository.findEntity.mockResolvedValue(mockEntity);
            mockIntegrationRepository.findIntegrationsByEntityId.mockResolvedValue(
                [mockIntegration]
            );
            mockLoadIntegrationContextUseCase.execute.mockResolvedValue(
                mockContext
            );

            const result = await useCase.execute({
                externalId: 'ext-123',
                type: 'slack',
            });

            expect(
                mockIntegrationRepository.findIntegrationsByEntityId
            ).toHaveBeenCalledWith('entity-123');
            expect(result).toEqual({
                context: mockContext,
                entity: mockEntity,
                record: mockIntegration,
            });
        });

        it('filters by type when multiple integrations exist for entity', async () => {
            const mockEntity = { id: 'entity-123', externalId: 'ext-123' };
            const slackIntegration = {
                id: 'integration-slack',
                config: { type: 'slack' },
            };
            const hubspotIntegration = {
                id: 'integration-hubspot',
                config: { type: 'hubspot' },
            };
            const mockContext = { integration: slackIntegration };

            mockModuleRepository.findEntity.mockResolvedValue(mockEntity);
            mockIntegrationRepository.findIntegrationsByEntityId.mockResolvedValue(
                [hubspotIntegration, slackIntegration]
            );
            mockLoadIntegrationContextUseCase.execute.mockResolvedValue(
                mockContext
            );

            const result = await useCase.execute({
                externalId: 'ext-123',
                type: 'slack',
            });

            expect(result.record).toBe(slackIntegration);
            expect(result.record.id).toBe('integration-slack');
        });
    });
});
