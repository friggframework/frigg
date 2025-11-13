/**
 * Tests for TriggerDatabaseMigrationUseCase
 */

const {
    TriggerDatabaseMigrationUseCase,
    ValidationError,
} = require('./trigger-database-migration-use-case');

/**
 * @group unit
 * @group application
 */
describe('TriggerDatabaseMigrationUseCase', () => {
    let useCase;
    let mockMigrationStatusRepository;
    let mockQueuerUtil;
    let originalEnv;

    beforeEach(() => {
        // Save original environment value
        originalEnv = process.env.DB_MIGRATION_QUEUE_URL;

        // Set test environment
        process.env.DB_MIGRATION_QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/123456789/test-queue';

        // Create mock repository
        mockMigrationStatusRepository = {
            create: jest.fn().mockResolvedValue({
                migrationId: 'migration-123',
                stage: 'production',
                state: 'INITIALIZING',
                progress: 0,
                triggeredBy: 'user-456',
                triggeredAt: new Date().toISOString(),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
            }),
            update: jest.fn().mockResolvedValue(true),
        };

        // Create mock queuer util
        mockQueuerUtil = {
            send: jest.fn().mockResolvedValue({ MessageId: 'msg-123' }),
        };

        // Create use case with mocks
        useCase = new TriggerDatabaseMigrationUseCase({
            migrationStatusRepository: mockMigrationStatusRepository,
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
        it('should throw error if migrationStatusRepository not provided', () => {
            expect(() => {
                new TriggerDatabaseMigrationUseCase({});
            }).toThrow('migrationStatusRepository dependency is required');
        });

        it('should accept custom queuerUtil', () => {
            const customQueuer = { send: jest.fn() };
            const instance = new TriggerDatabaseMigrationUseCase({
                migrationStatusRepository: mockMigrationStatusRepository,
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

            // Verify migration status creation (S3 repository interface)
            expect(mockMigrationStatusRepository.create).toHaveBeenCalledWith({
                stage: 'production',
                triggeredBy: 'user-456',
                triggeredAt: expect.any(String),
            });

            // Verify SQS message sent
            expect(mockQueuerUtil.send).toHaveBeenCalledWith(
                {
                    migrationId: 'migration-123',
                    dbType: 'postgresql',
                    stage: 'production',
                },
                'https://sqs.us-east-1.amazonaws.com/123456789/test-queue'
            );

            // Verify response
            expect(result).toEqual({
                success: true,
                migrationId: 'migration-123',
                state: 'INITIALIZING',
                statusUrl: '/db-migrate/migration-123',
                s3Key: expect.stringContaining('migrations/'),
                message: 'Database migration queued successfully',
            });
        });

        it('should handle MongoDB dbType', async () => {
            await useCase.execute({
                userId: 'user-456',
                dbType: 'mongodb',
                stage: 'dev',
            });

            expect(mockMigrationStatusRepository.create).toHaveBeenCalledWith({
                stage: 'dev',
                triggeredBy: 'user-456',
                triggeredAt: expect.any(String),
            });
        });

        it('should allow userId to be omitted (system migrations)', async () => {
            const result = await useCase.execute({
                dbType: 'postgresql',
                stage: 'production',
            });

            // Should use 'system' as triggeredBy when userId not provided
            expect(mockMigrationStatusRepository.create).toHaveBeenCalledWith({
                stage: 'production',
                triggeredBy: 'system',
                triggeredAt: expect.any(String),
            });

            expect(result.success).toBe(true);
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

            // Verify migration status was marked as failed
            expect(mockMigrationStatusRepository.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    migrationId: 'migration-123',
                    state: 'FAILED',
                    error: expect.stringContaining('Failed to queue migration'),
                })
            );
        });

        it('should handle migration status creation failure', async () => {
            mockMigrationStatusRepository.create.mockRejectedValue(new Error('S3 error'));

            await expect(
                useCase.execute({
                    userId: 'user-456',
                    dbType: 'postgresql',
                    stage: 'production',
                })
            ).rejects.toThrow('S3 error');

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

