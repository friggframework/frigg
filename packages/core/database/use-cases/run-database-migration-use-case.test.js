/**
 * Tests for Run Database Migration Use Case
 */

const {
    RunDatabaseMigrationUseCase,
    MigrationError,
    ValidationError,
} = require('./run-database-migration-use-case');

describe('RunDatabaseMigrationUseCase', () => {
    let useCase;
    let mockPrismaRunner;

    beforeEach(() => {
        // Mock prisma runner with all required methods
        mockPrismaRunner = {
            runPrismaGenerate: jest.fn(),
            runPrismaMigrate: jest.fn(),
            runPrismaDbPush: jest.fn(),
            getMigrationCommand: jest.fn(),
        };

        useCase = new RunDatabaseMigrationUseCase({ prismaRunner: mockPrismaRunner });
    });

    describe('Constructor', () => {
        it('should throw error if prismaRunner is not provided', () => {
            expect(() => new RunDatabaseMigrationUseCase({})).toThrow('prismaRunner dependency is required');
        });

        it('should create instance with valid dependencies', () => {
            expect(useCase).toBeInstanceOf(RunDatabaseMigrationUseCase);
            expect(useCase.prismaRunner).toBe(mockPrismaRunner);
        });
    });

    describe('Parameter Validation', () => {
        it('should throw ValidationError if dbType is missing', async () => {
            await expect(useCase.execute({ stage: 'production' })).rejects.toThrow(ValidationError);
            await expect(useCase.execute({ stage: 'production' })).rejects.toThrow('dbType is required');
        });

        it('should throw ValidationError if dbType is not a string', async () => {
            await expect(useCase.execute({ dbType: 123, stage: 'production' })).rejects.toThrow(ValidationError);
            await expect(useCase.execute({ dbType: 123, stage: 'production' })).rejects.toThrow(
                'dbType must be a string'
            );
        });

        it('should throw ValidationError if stage is missing', async () => {
            await expect(useCase.execute({ dbType: 'postgresql' })).rejects.toThrow(ValidationError);
            await expect(useCase.execute({ dbType: 'postgresql' })).rejects.toThrow('stage is required');
        });

        it('should throw ValidationError if stage is not a string', async () => {
            await expect(useCase.execute({ dbType: 'postgresql', stage: 123 })).rejects.toThrow(ValidationError);
            await expect(useCase.execute({ dbType: 'postgresql', stage: 123 })).rejects.toThrow(
                'stage must be a string'
            );
        });
    });

    describe('PostgreSQL Migrations', () => {
        beforeEach(() => {
            mockPrismaRunner.runPrismaGenerate.mockResolvedValue({ success: true });
            mockPrismaRunner.runPrismaMigrate.mockResolvedValue({ success: true });
        });

        it('should successfully run PostgreSQL production migration', async () => {
            mockPrismaRunner.getMigrationCommand.mockReturnValue('deploy');

            const result = await useCase.execute({
                dbType: 'postgresql',
                stage: 'production',
                verbose: true,
            });

            expect(result).toEqual({
                success: true,
                dbType: 'postgresql',
                stage: 'production',
                command: 'deploy',
                message: 'Database migration completed successfully',
            });

            expect(mockPrismaRunner.runPrismaGenerate).toHaveBeenCalledWith('postgresql', true);
            expect(mockPrismaRunner.getMigrationCommand).toHaveBeenCalledWith('production');
            expect(mockPrismaRunner.runPrismaMigrate).toHaveBeenCalledWith('deploy', true);
            expect(mockPrismaRunner.runPrismaDbPush).not.toHaveBeenCalled();
        });

        it('should successfully run PostgreSQL development migration', async () => {
            mockPrismaRunner.getMigrationCommand.mockReturnValue('dev');

            const result = await useCase.execute({
                dbType: 'postgresql',
                stage: 'dev',
            });

            expect(result.success).toBe(true);
            expect(result.command).toBe('dev');
            expect(mockPrismaRunner.getMigrationCommand).toHaveBeenCalledWith('dev');
            expect(mockPrismaRunner.runPrismaMigrate).toHaveBeenCalledWith('dev', false);
        });

        it('should throw MigrationError if Prisma generate fails', async () => {
            mockPrismaRunner.runPrismaGenerate.mockResolvedValue({
                success: false,
                error: 'Schema file not found',
                output: 'Error output',
            });

            await expect(
                useCase.execute({ dbType: 'postgresql', stage: 'production' })
            ).rejects.toThrow(MigrationError);

            await expect(
                useCase.execute({ dbType: 'postgresql', stage: 'production' })
            ).rejects.toThrow('Failed to generate Prisma client: Schema file not found');

            expect(mockPrismaRunner.runPrismaMigrate).not.toHaveBeenCalled();
        });

        it('should throw MigrationError if PostgreSQL migration fails', async () => {
            mockPrismaRunner.getMigrationCommand.mockReturnValue('deploy');
            mockPrismaRunner.runPrismaMigrate.mockResolvedValue({
                success: false,
                error: 'Migration conflict detected',
                output: 'Conflict output',
            });

            await expect(
                useCase.execute({ dbType: 'postgresql', stage: 'production' })
            ).rejects.toThrow(MigrationError);

            await expect(
                useCase.execute({ dbType: 'postgresql', stage: 'production' })
            ).rejects.toThrow('PostgreSQL migration failed: Migration conflict detected');
        });

        it('should include context in MigrationError', async () => {
            mockPrismaRunner.getMigrationCommand.mockReturnValue('deploy');
            mockPrismaRunner.runPrismaMigrate.mockResolvedValue({
                success: false,
                error: 'Migration failed',
                output: 'Error output',
            });

            try {
                await useCase.execute({ dbType: 'postgresql', stage: 'production' });
                fail('Should have thrown MigrationError');
            } catch (error) {
                expect(error).toBeInstanceOf(MigrationError);
                expect(error.context).toEqual({
                    dbType: 'postgresql',
                    stage: 'production',
                    command: 'deploy',
                    step: 'migrate',
                    output: 'Error output',
                });
            }
        });
    });

    describe('MongoDB Migrations', () => {
        beforeEach(() => {
            mockPrismaRunner.runPrismaGenerate.mockResolvedValue({ success: true });
            mockPrismaRunner.runPrismaDbPush.mockResolvedValue({ success: true });
        });

        it('should successfully run MongoDB migration', async () => {
            const result = await useCase.execute({
                dbType: 'mongodb',
                stage: 'production',
                verbose: true,
            });

            expect(result).toEqual({
                success: true,
                dbType: 'mongodb',
                stage: 'production',
                command: 'db push',
                message: 'Database migration completed successfully',
            });

            expect(mockPrismaRunner.runPrismaGenerate).toHaveBeenCalledWith('mongodb', true);
            expect(mockPrismaRunner.runPrismaDbPush).toHaveBeenCalledWith(true, true); // verbose=true, nonInteractive=true
            expect(mockPrismaRunner.runPrismaMigrate).not.toHaveBeenCalled();
        });

        it('should use non-interactive mode for MongoDB', async () => {
            await useCase.execute({
                dbType: 'mongodb',
                stage: 'production',
            });

            // Second parameter should be true for non-interactive
            expect(mockPrismaRunner.runPrismaDbPush).toHaveBeenCalledWith(false, true);
        });

        it('should throw MigrationError if MongoDB push fails', async () => {
            mockPrismaRunner.runPrismaDbPush.mockResolvedValue({
                success: false,
                error: 'Connection timeout',
            });

            await expect(useCase.execute({ dbType: 'mongodb', stage: 'production' })).rejects.toThrow(
                MigrationError
            );

            await expect(useCase.execute({ dbType: 'mongodb', stage: 'production' })).rejects.toThrow(
                'MongoDB push failed: Connection timeout'
            );
        });
    });

    describe('Unsupported Database Types', () => {
        beforeEach(() => {
            mockPrismaRunner.runPrismaGenerate.mockResolvedValue({ success: true });
        });

        it('should throw ValidationError for unsupported database type', async () => {
            await expect(useCase.execute({ dbType: 'mysql', stage: 'production' })).rejects.toThrow(
                ValidationError
            );

            await expect(useCase.execute({ dbType: 'mysql', stage: 'production' })).rejects.toThrow(
                "Unsupported database type: mysql. Must be 'postgresql' or 'mongodb'."
            );
        });

        it('should run Prisma generate before checking database type', async () => {
            try {
                await useCase.execute({ dbType: 'mysql', stage: 'production' });
            } catch (error) {
                // Expected error
            }

            expect(mockPrismaRunner.runPrismaGenerate).toHaveBeenCalledWith('mysql', false);
        });
    });

    describe('Error Handling', () => {
        it('should handle undefined error from Prisma generate', async () => {
            mockPrismaRunner.runPrismaGenerate.mockResolvedValue({
                success: false,
                error: undefined,
            });

            await expect(useCase.execute({ dbType: 'postgresql', stage: 'production' })).rejects.toThrow(
                'Failed to generate Prisma client: Unknown error'
            );
        });

        it('should handle undefined error from PostgreSQL migration', async () => {
            mockPrismaRunner.runPrismaGenerate.mockResolvedValue({ success: true });
            mockPrismaRunner.getMigrationCommand.mockReturnValue('deploy');
            mockPrismaRunner.runPrismaMigrate.mockResolvedValue({
                success: false,
                error: undefined,
            });

            await expect(useCase.execute({ dbType: 'postgresql', stage: 'production' })).rejects.toThrow(
                'PostgreSQL migration failed: Unknown error'
            );
        });

        it('should handle undefined error from MongoDB push', async () => {
            mockPrismaRunner.runPrismaGenerate.mockResolvedValue({ success: true });
            mockPrismaRunner.runPrismaDbPush.mockResolvedValue({
                success: false,
                error: undefined,
            });

            await expect(useCase.execute({ dbType: 'mongodb', stage: 'production' })).rejects.toThrow(
                'MongoDB push failed: Unknown error'
            );
        });
    });

    describe('Verbose Mode', () => {
        beforeEach(() => {
            mockPrismaRunner.runPrismaGenerate.mockResolvedValue({ success: true });
            mockPrismaRunner.runPrismaMigrate.mockResolvedValue({ success: true });
            mockPrismaRunner.getMigrationCommand.mockReturnValue('deploy');
        });

        it('should pass verbose flag to all Prisma operations', async () => {
            await useCase.execute({
                dbType: 'postgresql',
                stage: 'production',
                verbose: true,
            });

            expect(mockPrismaRunner.runPrismaGenerate).toHaveBeenCalledWith('postgresql', true);
            expect(mockPrismaRunner.runPrismaMigrate).toHaveBeenCalledWith('deploy', true);
        });

        it('should default verbose to false', async () => {
            await useCase.execute({
                dbType: 'postgresql',
                stage: 'production',
            });

            expect(mockPrismaRunner.runPrismaGenerate).toHaveBeenCalledWith('postgresql', false);
            expect(mockPrismaRunner.runPrismaMigrate).toHaveBeenCalledWith('deploy', false);
        });
    });
});
