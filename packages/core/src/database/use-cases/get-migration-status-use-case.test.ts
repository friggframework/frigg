import {
    GetMigrationStatusUseCase,
    ValidationError,
    NotFoundError,
} from './get-migration-status-use-case';

describe('GetMigrationStatusUseCase', () => {
    let useCase: GetMigrationStatusUseCase;
    let mockMigrationStatusRepository: any;

    beforeEach(() => {
        mockMigrationStatusRepository = {
            get: jest.fn(),
        };

        useCase = new GetMigrationStatusUseCase({
            migrationStatusRepository: mockMigrationStatusRepository,
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        it('should throw error if migrationStatusRepository not provided', () => {
            expect(() => {
                new GetMigrationStatusUseCase({} as any);
            }).toThrow('migrationStatusRepository dependency is required');
        });
    });

    describe('execute', () => {
        it('should return migration status for COMPLETED process', async () => {
            const mockProcess = {
                id: 'process-123',
                type: 'DATABASE_MIGRATION',
                state: 'COMPLETED',
                context: {
                    dbType: 'postgresql',
                    stage: 'production',
                    migrationCommand: 'migrate deploy',
                },
                results: {
                    success: true,
                    duration: '2341ms',
                    timestamp: '2025-10-18T10:30:00Z',
                },
                createdAt: new Date('2025-10-18T10:29:55Z'),
                updatedAt: new Date('2025-10-18T10:30:02Z'),
            };

            mockMigrationStatusRepository.get.mockResolvedValue(mockProcess);

            const result = await useCase.execute('migration-123', 'production');

            expect(mockMigrationStatusRepository.get).toHaveBeenCalledWith('migration-123', 'production');
            expect(result).toEqual(mockProcess);
        });

        it('should return migration status for RUNNING migration', async () => {
            const mockProcess = {
                migrationId: 'migration-456',
                type: 'DATABASE_MIGRATION',
                state: 'RUNNING',
                context: {
                    dbType: 'mongodb',
                    stage: 'dev',
                    startedAt: '2025-10-18T10:30:00Z',
                },
                results: {},
                createdAt: new Date('2025-10-18T10:29:55Z'),
                updatedAt: new Date('2025-10-18T10:30:00Z'),
            };

            mockMigrationStatusRepository.get.mockResolvedValue(mockProcess);

            const result = await useCase.execute('migration-456', 'dev');

            expect(result.state).toBe('RUNNING');
            expect((result as any).context.dbType).toBe('mongodb');
        });

        it('should return migration status for FAILED migration', async () => {
            const mockStatus = {
                migrationId: 'migration-789',
                stage: 'production',
                state: 'FAILED',
                progress: 0,
                error: 'Migration failed: syntax error',
                triggeredBy: 'admin',
                triggeredAt: '2025-10-18T10:29:55Z',
                completedAt: '2025-10-18T10:30:00Z',
            };

            mockMigrationStatusRepository.get.mockResolvedValue(mockStatus);

            const result = await useCase.execute('migration-789', 'production');

            expect(mockMigrationStatusRepository.get).toHaveBeenCalledWith('migration-789', 'production');
            expect(result.state).toBe('FAILED');
            expect(result.error).toContain('Migration failed');
        });

        it('should throw NotFoundError if migration does not exist', async () => {
            mockMigrationStatusRepository.get.mockRejectedValue(new Error('Migration not found: nonexistent-123'));

            await expect(
                useCase.execute('nonexistent-123', 'dev')
            ).rejects.toThrow(NotFoundError);

            await expect(
                useCase.execute('nonexistent-123', 'dev')
            ).rejects.toThrow('Migration not found');
        });

        it('should throw ValidationError if migrationId is missing', async () => {
            await expect(
                useCase.execute(null as any)
            ).rejects.toThrow(ValidationError);

            await expect(
                useCase.execute(undefined as any)
            ).rejects.toThrow('migrationId is required');
        });

        it('should throw ValidationError if migrationId is not a string', async () => {
            await expect(
                useCase.execute(123 as any)
            ).rejects.toThrow('migrationId must be a string');
        });

        it('should handle repository errors', async () => {
            mockMigrationStatusRepository.get.mockRejectedValue(new Error('S3 connection failed'));

            await expect(
                useCase.execute('migration-123', 'dev')
            ).rejects.toThrow('S3 connection failed');
        });
    });

    describe('NotFoundError', () => {
        it('should have correct properties', () => {
            const error = new NotFoundError('test message');
            expect(error.name).toBe('NotFoundError');
            expect(error.message).toBe('test message');
            expect(error.statusCode).toBe(404);
            expect(error instanceof Error).toBe(true);
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
