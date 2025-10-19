/**
 * Tests for GetMigrationStatusUseCase
 */

const {
    GetMigrationStatusUseCase,
    ValidationError,
    NotFoundError,
} = require('./get-migration-status-use-case');

describe('GetMigrationStatusUseCase', () => {
    let useCase;
    let mockProcessRepository;

    beforeEach(() => {
        // Create mock repository
        mockProcessRepository = {
            findById: jest.fn(),
        };

        // Create use case with mock
        useCase = new GetMigrationStatusUseCase({
            processRepository: mockProcessRepository,
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('constructor', () => {
        it('should throw error if processRepository not provided', () => {
            expect(() => {
                new GetMigrationStatusUseCase({});
            }).toThrow('processRepository dependency is required');
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

            mockProcessRepository.findById.mockResolvedValue(mockProcess);

            const result = await useCase.execute({ processId: 'process-123' });

            expect(mockProcessRepository.findById).toHaveBeenCalledWith('process-123');
            expect(result).toEqual({
                processId: 'process-123',
                type: 'DATABASE_MIGRATION',
                state: 'COMPLETED',
                context: mockProcess.context,
                results: mockProcess.results,
                createdAt: mockProcess.createdAt,
                updatedAt: mockProcess.updatedAt,
            });
        });

        it('should return migration status for RUNNING process', async () => {
            const mockProcess = {
                id: 'process-456',
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

            mockProcessRepository.findById.mockResolvedValue(mockProcess);

            const result = await useCase.execute({ processId: 'process-456' });

            expect(result.state).toBe('RUNNING');
            expect(result.context.dbType).toBe('mongodb');
        });

        it('should return migration status for FAILED process', async () => {
            const mockProcess = {
                id: 'process-789',
                type: 'DATABASE_MIGRATION',
                state: 'FAILED',
                context: {
                    dbType: 'postgresql',
                    stage: 'production',
                    failedAt: '2025-10-18T10:30:00Z',
                },
                results: {
                    error: 'Migration failed: syntax error',
                    errorType: 'MigrationError',
                },
                createdAt: new Date('2025-10-18T10:29:55Z'),
                updatedAt: new Date('2025-10-18T10:30:00Z'),
            };

            mockProcessRepository.findById.mockResolvedValue(mockProcess);

            const result = await useCase.execute({ processId: 'process-789' });

            expect(result.state).toBe('FAILED');
            expect(result.results.error).toContain('Migration failed');
        });

        it('should handle empty context and results', async () => {
            const mockProcess = {
                id: 'process-999',
                type: 'DATABASE_MIGRATION',
                state: 'INITIALIZING',
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockProcessRepository.findById.mockResolvedValue(mockProcess);

            const result = await useCase.execute({ processId: 'process-999' });

            expect(result.context).toEqual({});
            expect(result.results).toEqual({});
        });

        it('should throw NotFoundError if process does not exist', async () => {
            mockProcessRepository.findById.mockResolvedValue(null);

            await expect(
                useCase.execute({ processId: 'nonexistent-123' })
            ).rejects.toThrow(NotFoundError);

            await expect(
                useCase.execute({ processId: 'nonexistent-123' })
            ).rejects.toThrow('Migration process not found: nonexistent-123');
        });

        it('should throw error if process is not a migration process', async () => {
            const nonMigrationProcess = {
                id: 'process-999',
                type: 'CRM_SYNC', // Not a migration
                state: 'RUNNING',
                context: {},
                results: {},
                createdAt: new Date(),
                updatedAt: new Date(),
            };

            mockProcessRepository.findById.mockResolvedValue(nonMigrationProcess);

            await expect(
                useCase.execute({ processId: 'process-999' })
            ).rejects.toThrow('Process process-999 is not a migration process (type: CRM_SYNC)');
        });

        it('should throw ValidationError if processId is missing', async () => {
            await expect(
                useCase.execute({})
            ).rejects.toThrow(ValidationError);

            await expect(
                useCase.execute({})
            ).rejects.toThrow('processId is required');
        });

        it('should throw ValidationError if processId is not a string', async () => {
            await expect(
                useCase.execute({ processId: 123 })
            ).rejects.toThrow('processId must be a string');
        });

        it('should handle repository errors', async () => {
            mockProcessRepository.findById.mockRejectedValue(new Error('Database connection failed'));

            await expect(
                useCase.execute({ processId: 'process-123' })
            ).rejects.toThrow('Database connection failed');
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

