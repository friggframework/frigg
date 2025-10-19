/**
 * Tests for TriggerDatabaseMigrationUseCase
 */

const {
    TriggerDatabaseMigrationUseCase,
    ValidationError,
} = require('./trigger-database-migration-use-case');

describe('TriggerDatabaseMigrationUseCase', () => {
    let useCase;
    let mockProcessRepository;
    let mockQueuerUtil;
    let originalEnv;

    beforeEach(() => {
        // Save original environment value
        originalEnv = process.env.DB_MIGRATION_QUEUE_URL;

        // Set test environment
        process.env.DB_MIGRATION_QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/123456789/test-queue';

        // Create mock repository
        mockProcessRepository = {
            create: jest.fn().mockResolvedValue({
                id: 'process-123',
                userId: 'user-456',
                integrationId: null,
                name: 'database-migration',
                type: 'DATABASE_MIGRATION',
                state: 'INITIALIZING',
                context: {
                    dbType: 'postgresql',
                    stage: 'production',
                },
                results: {},
                createdAt: new Date(),
                updatedAt: new Date(),
            }),
            updateState: jest.fn().mockResolvedValue(true),
        };

        // Create mock queuer util
        mockQueuerUtil = {
            send: jest.fn().mockResolvedValue({ MessageId: 'msg-123' }),
        };

        // Create use case with mocks
        useCase = new TriggerDatabaseMigrationUseCase({
            processRepository: mockProcessRepository,
            queuerUtil: mockQueuerUtil,
        });
    });

    afterEach(() => {
        // Restore original environment
        if (originalEnv !== undefined) {
            process.env.DB_MIGRATION_QUEUE_URL = originalEnv;
        } else {
            delete process.env.DB_MIGRATION_QUEUE_URL;
        }
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        it('should throw error if processRepository not provided', () => {
            expect(() => {
                new TriggerDatabaseMigrationUseCase({});
            }).toThrow('processRepository dependency is required');
        });

        it('should accept custom queuerUtil', () => {
            const customQueuer = { send: jest.fn() };
            const instance = new TriggerDatabaseMigrationUseCase({
                processRepository: mockProcessRepository,
                queuerUtil: customQueuer,
            });

            expect(instance.queuerUtil).toBe(customQueuer);
        });
    });

    describe('execute', () => {
        it('should create process and queue migration job', async () => {
            const result = await useCase.execute({
                userId: 'user-456',
                dbType: 'postgresql',
                stage: 'production',
            });

            // Verify process creation
            expect(mockProcessRepository.create).toHaveBeenCalledWith({
                userId: 'user-456',
                integrationId: null,
                name: 'database-migration',
                type: 'DATABASE_MIGRATION',
                state: 'INITIALIZING',
                context: expect.objectContaining({
                    dbType: 'postgresql',
                    stage: 'production',
                }),
                results: {},
            });

            // Verify SQS message sent
            expect(mockQueuerUtil.send).toHaveBeenCalledWith(
                {
                    processId: 'process-123',
                    dbType: 'postgresql',
                    stage: 'production',
                },
                'https://sqs.us-east-1.amazonaws.com/123456789/test-queue'
            );

            // Verify response
            expect(result).toEqual({
                success: true,
                processId: 'process-123',
                state: 'INITIALIZING',
                statusUrl: '/db-migrate/process-123',
                message: 'Database migration queued successfully',
            });
        });

        it('should handle MongoDB dbType', async () => {
            await useCase.execute({
                userId: 'user-456',
                dbType: 'mongodb',
                stage: 'dev',
            });

            expect(mockProcessRepository.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    context: expect.objectContaining({
                        dbType: 'mongodb',
                        stage: 'dev',
                    }),
                })
            );
        });

        it('should throw ValidationError if userId is missing', async () => {
            await expect(
                useCase.execute({
                    dbType: 'postgresql',
                    stage: 'production',
                })
            ).rejects.toThrow(ValidationError);

            await expect(
                useCase.execute({
                    dbType: 'postgresql',
                    stage: 'production',
                })
            ).rejects.toThrow('userId is required');
        });

        it('should throw ValidationError if userId is not a string', async () => {
            await expect(
                useCase.execute({
                    userId: 123,
                    dbType: 'postgresql',
                    stage: 'production',
                })
            ).rejects.toThrow('userId must be a string');
        });

        it('should throw ValidationError if dbType is missing', async () => {
            await expect(
                useCase.execute({
                    userId: 'user-456',
                    stage: 'production',
                })
            ).rejects.toThrow('dbType is required');
        });

        it('should throw ValidationError if dbType is invalid', async () => {
            await expect(
                useCase.execute({
                    userId: 'user-456',
                    dbType: 'mysql',
                    stage: 'production',
                })
            ).rejects.toThrow('Invalid dbType: "mysql"');
        });

        it('should throw ValidationError if stage is missing', async () => {
            await expect(
                useCase.execute({
                    userId: 'user-456',
                    dbType: 'postgresql',
                })
            ).rejects.toThrow('stage is required');
        });

        it('should throw ValidationError if stage is not a string', async () => {
            await expect(
                useCase.execute({
                    userId: 'user-456',
                    dbType: 'postgresql',
                    stage: 123,
                })
            ).rejects.toThrow('stage must be a string');
        });

        it('should throw error if DB_MIGRATION_QUEUE_URL not set', async () => {
            delete process.env.DB_MIGRATION_QUEUE_URL;

            await expect(
                useCase.execute({
                    userId: 'user-456',
                    dbType: 'postgresql',
                    stage: 'production',
                })
            ).rejects.toThrow('DB_MIGRATION_QUEUE_URL environment variable is not set');
        });

        it('should update process to FAILED if queue send fails', async () => {
            mockQueuerUtil.send.mockRejectedValue(new Error('SQS unavailable'));

            await expect(
                useCase.execute({
                    userId: 'user-456',
                    dbType: 'postgresql',
                    stage: 'production',
                })
            ).rejects.toThrow('Failed to queue migration: SQS unavailable');

            // Verify process was marked as failed
            expect(mockProcessRepository.updateState).toHaveBeenCalledWith(
                'process-123',
                'FAILED',
                {
                    error: 'Failed to queue migration job',
                    errorDetails: 'SQS unavailable',
                }
            );
        });

        it('should handle process creation failure', async () => {
            mockProcessRepository.create.mockRejectedValue(new Error('Database error'));

            await expect(
                useCase.execute({
                    userId: 'user-456',
                    dbType: 'postgresql',
                    stage: 'production',
                })
            ).rejects.toThrow('Database error');

            // Should not attempt to send to queue if process creation fails
            expect(mockQueuerUtil.send).not.toHaveBeenCalled();
        });
    });

    describe('ValidationError', () => {
        it('should have correct name', () => {
            const error = new ValidationError('test message');
            expect(error.name).toBe('ValidationError');
            expect(error.message).toBe('test message');
            expect(error instanceof Error).toBe(true);
        });
    });
});

