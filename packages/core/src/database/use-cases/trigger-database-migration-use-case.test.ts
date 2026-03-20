import {
    TriggerDatabaseMigrationUseCase,
    ValidationError,
} from './trigger-database-migration-use-case';

describe('TriggerDatabaseMigrationUseCase', () => {
    let useCase: TriggerDatabaseMigrationUseCase;
    let mockMigrationStatusRepository: any;
    let mockQueuerUtil: any;
    let originalEnv: string | undefined;

    beforeEach(() => {
        originalEnv = process.env.DB_MIGRATION_QUEUE_URL;

        process.env.DB_MIGRATION_QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/123456789/test-queue';

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

        mockQueuerUtil = {
            send: jest.fn().mockResolvedValue({ MessageId: 'msg-123' }),
        };

        useCase = new TriggerDatabaseMigrationUseCase({
            migrationStatusRepository: mockMigrationStatusRepository,
            queuerUtil: mockQueuerUtil,
        });
    });

    afterEach(() => {
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
                const _instance = new TriggerDatabaseMigrationUseCase({} as any);
            }).toThrow('migrationStatusRepository dependency is required');
        });

        it('should accept custom queuerUtil', () => {
            const customQueuer = { send: jest.fn() };
            const instance = new TriggerDatabaseMigrationUseCase({
                migrationStatusRepository: mockMigrationStatusRepository,
                queuerUtil: customQueuer,
            });

            expect((instance as any).queuerUtil).toBe(customQueuer);
        });
    });

    describe('execute', () => {
        it('should create process and queue migration job', async () => {
            const result = await useCase.execute({
                userId: 'user-456',
                dbType: 'postgresql',
                stage: 'production',
            });

            expect(mockMigrationStatusRepository.create).toHaveBeenCalledWith({
                stage: 'production',
                triggeredBy: 'user-456',
                triggeredAt: expect.any(String),
            });

            expect(mockQueuerUtil.send).toHaveBeenCalledWith(
                {
                    migrationId: 'migration-123',
                    dbType: 'postgresql',
                    stage: 'production',
                },
                'https://sqs.us-east-1.amazonaws.com/123456789/test-queue'
            );

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

        it('should handle DocumentDB dbType', async () => {
            await useCase.execute({
                userId: 'user-456',
                dbType: 'documentdb',
                stage: 'dev',
            });

            expect(mockMigrationStatusRepository.create).toHaveBeenCalledWith({
                stage: 'dev',
                triggeredBy: 'user-456',
                triggeredAt: expect.any(String),
            });

            expect(mockQueuerUtil.send).toHaveBeenCalledWith(
                {
                    migrationId: 'migration-123',
                    dbType: 'documentdb',
                    stage: 'dev',
                },
                'https://sqs.us-east-1.amazonaws.com/123456789/test-queue'
            );
        });

        it('should allow userId to be omitted (system migrations)', async () => {
            const result = await useCase.execute({
                dbType: 'postgresql',
                stage: 'production',
            });

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
                    userId: 123 as any,
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
                } as any)
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
                } as any)
            ).rejects.toThrow('stage is required');
        });

        it('should throw ValidationError if stage is not a string', async () => {
            await expect(
                useCase.execute({
                    userId: 'user-456',
                    dbType: 'postgresql',
                    stage: 123 as any,
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
