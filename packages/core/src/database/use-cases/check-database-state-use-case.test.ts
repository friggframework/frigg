import {
    CheckDatabaseStateUseCase,
    ValidationError,
} from './check-database-state-use-case';

describe('CheckDatabaseStateUseCase', () => {
    let useCase: CheckDatabaseStateUseCase;
    let mockPrismaRunner: any;

    beforeEach(() => {
        mockPrismaRunner = {
            checkDatabaseState: jest.fn(),
        };

        useCase = new CheckDatabaseStateUseCase({
            prismaRunner: mockPrismaRunner,
        });
    });

    describe('constructor', () => {
        it('should throw error if prismaRunner not provided', () => {
            expect(() => {
                const _instance = new CheckDatabaseStateUseCase({} as any);
            }).toThrow('prismaRunner dependency is required');
        });
    });

    describe('execute()', () => {
        it('should return up-to-date status when no migrations pending', async () => {
            mockPrismaRunner.checkDatabaseState.mockResolvedValue({
                upToDate: true,
            });

            const result = await useCase.execute('postgresql', 'prod');

            expect(result).toEqual({
                upToDate: true,
                pendingMigrations: 0,
                dbType: 'postgresql',
                stage: 'prod',
            });
            expect(mockPrismaRunner.checkDatabaseState).toHaveBeenCalledWith('postgresql');
        });

        it('should return pending migrations count when migrations needed', async () => {
            mockPrismaRunner.checkDatabaseState.mockResolvedValue({
                upToDate: false,
                pendingMigrations: 3,
            });

            const result = await useCase.execute('postgresql', 'prod');

            expect(result).toEqual({
                upToDate: false,
                pendingMigrations: 3,
                dbType: 'postgresql',
                stage: 'prod',
                recommendation: 'Run POST /db-migrate to apply 3 pending migration(s)',
            });
        });

        it('should handle database error state', async () => {
            mockPrismaRunner.checkDatabaseState.mockResolvedValue({
                upToDate: false,
                error: 'Database not initialized',
            });

            const result = await useCase.execute('postgresql', 'dev');

            expect(result).toEqual({
                upToDate: false,
                pendingMigrations: 0,
                dbType: 'postgresql',
                stage: 'dev',
                error: 'Database not initialized',
                recommendation: 'Run POST /db-migrate to initialize database',
            });
        });

        it('should return up-to-date for MongoDB (uses db push)', async () => {
            mockPrismaRunner.checkDatabaseState.mockResolvedValue({
                upToDate: true,
            });

            const result = await useCase.execute('mongodb', 'prod');

            expect(result).toEqual({
                upToDate: true,
                pendingMigrations: 0,
                dbType: 'mongodb',
                stage: 'prod',
            });
        });

        it('should default stage to production if not provided', async () => {
            mockPrismaRunner.checkDatabaseState.mockResolvedValue({
                upToDate: true,
            });

            const result = await useCase.execute('postgresql');

            expect(result.stage).toBe('production');
        });

        it('should throw ValidationError for invalid dbType', async () => {
            await expect(
                useCase.execute('invalid-db', 'prod')
            ).rejects.toThrow(ValidationError);

            await expect(
                useCase.execute('invalid-db', 'prod')
            ).rejects.toThrow('dbType must be postgresql, mongodb, or documentdb');
        });

        it('should throw ValidationError for missing dbType', async () => {
            await expect(
                useCase.execute(null as any, 'prod')
            ).rejects.toThrow(ValidationError);
        });

        it('should handle prismaRunner errors gracefully', async () => {
            mockPrismaRunner.checkDatabaseState.mockRejectedValue(
                new Error('Prisma CLI not available')
            );

            await expect(
                useCase.execute('postgresql', 'prod')
            ).rejects.toThrow('Prisma CLI not available');
        });
    });
});
