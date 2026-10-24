// Mock all dependencies BEFORE importing dbSetupCommand
const mockValidator = {
    validateDatabaseUrl: jest.fn(),
    getDatabaseType: jest.fn(),
    testDatabaseConnection: jest.fn(),
    checkPrismaClientGenerated: jest.fn(),
};

const mockRunner = {
    runPrismaGenerate: jest.fn(),
    checkDatabaseState: jest.fn(),
    runPrismaMigrate: jest.fn(),
    runPrismaDbPush: jest.fn(),
    getMigrationCommand: jest.fn(),
};

const mockErrorMessages = {
    getDatabaseUrlMissingError: jest.fn(),
    getDatabaseTypeNotConfiguredError: jest.fn(),
    getDatabaseConnectionError: jest.fn(),
    getPrismaCommandError: jest.fn(),
    getDatabaseSetupSuccess: jest.fn(),
};

jest.mock('../../../utils/database-validator', () => mockValidator);
jest.mock(
    '@friggframework/core/database/utils/prisma-runner',
    () => mockRunner
);
jest.mock('../../../utils/error-messages', () => mockErrorMessages);
jest.mock('dotenv');

const { dbSetupCommand } = require('../../../db-setup-command');
const {
    createMockDatabaseValidator,
    createMockPrismaRunner,
} = require('../../utils/prisma-mock');

const dotenv = require('dotenv');

describe('DB Setup Command', () => {
    let mockConsoleLog;
    let mockConsoleError;
    let mockProcessExit;

    beforeEach(() => {
        // Set up default mock return values using the factory utilities
        const defaultValidator = createMockDatabaseValidator();
        const defaultRunner = createMockPrismaRunner();

        // Apply default implementations
        mockValidator.validateDatabaseUrl.mockImplementation(
            defaultValidator.validateDatabaseUrl
        );
        mockValidator.getDatabaseType.mockImplementation(
            defaultValidator.getDatabaseType
        );
        mockValidator.testDatabaseConnection.mockImplementation(
            defaultValidator.testDatabaseConnection
        );
        mockValidator.checkPrismaClientGenerated.mockImplementation(
            defaultValidator.checkPrismaClientGenerated
        );

        mockRunner.runPrismaGenerate.mockImplementation(
            defaultRunner.runPrismaGenerate
        );
        mockRunner.checkDatabaseState.mockImplementation(
            defaultRunner.checkDatabaseState
        );
        mockRunner.runPrismaMigrate.mockImplementation(
            defaultRunner.runPrismaMigrate
        );
        mockRunner.runPrismaDbPush.mockImplementation(
            defaultRunner.runPrismaDbPush
        );
        mockRunner.getMigrationCommand.mockImplementation(
            defaultRunner.getMigrationCommand
        );

        // Mock dotenv
        dotenv.config = jest.fn();

        // Mock console and process.exit
        mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();
        mockConsoleError = jest.spyOn(console, 'error').mockImplementation();
        mockProcessExit = jest.spyOn(process, 'exit').mockImplementation();

        // Mock error message functions with default return values
        mockErrorMessages.getDatabaseUrlMissingError.mockReturnValue(
            'DATABASE_URL missing error'
        );
        mockErrorMessages.getDatabaseTypeNotConfiguredError.mockReturnValue(
            'DB type error'
        );
        mockErrorMessages.getDatabaseConnectionError.mockReturnValue(
            'Connection error'
        );
        mockErrorMessages.getPrismaCommandError.mockReturnValue('Prisma error');
        mockErrorMessages.getDatabaseSetupSuccess.mockReturnValue(
            'Success message'
        );
    });

    afterEach(() => {
        mockConsoleLog.mockRestore();
        mockConsoleError.mockRestore();
        mockProcessExit.mockRestore();
        jest.clearAllMocks();
    });

    describe('Success Cases', () => {
        it('should complete setup successfully for MongoDB', async () => {
            mockValidator.getDatabaseType.mockReturnValue({
                dbType: 'mongodb',
            });
            mockValidator.checkPrismaClientGenerated.mockReturnValue({
                generated: false, // Client doesn't exist, will generate
            });
            mockRunner.checkDatabaseState.mockResolvedValue({
                upToDate: false,
            });

            await dbSetupCommand({ verbose: false, stage: 'development' });

            expect(mockValidator.validateDatabaseUrl).toHaveBeenCalled();
            expect(mockValidator.getDatabaseType).toHaveBeenCalled();
            expect(
                mockValidator.checkPrismaClientGenerated
            ).toHaveBeenCalledWith('mongodb');
            expect(mockRunner.runPrismaGenerate).toHaveBeenCalledWith(
                'mongodb',
                false
            );
            expect(mockRunner.runPrismaDbPush).toHaveBeenCalled();
            expect(mockProcessExit).not.toHaveBeenCalled();
        });

        it('should treat DocumentDB as Mongo-compatible for schema pushes', async () => {
            mockValidator.getDatabaseType.mockReturnValue({
                dbType: 'documentdb',
            });
            mockValidator.checkPrismaClientGenerated.mockReturnValue({
                generated: false,
            });
            mockRunner.checkDatabaseState.mockResolvedValue({
                upToDate: false,
            });

            await dbSetupCommand({ verbose: false, stage: 'development' });

            expect(
                mockValidator.checkPrismaClientGenerated
            ).toHaveBeenCalledWith('documentdb');
            expect(mockRunner.runPrismaGenerate).toHaveBeenCalledWith(
                'mongodb',
                false
            );
            expect(mockRunner.runPrismaDbPush).toHaveBeenCalled();
            expect(mockConsoleLog).toHaveBeenCalledWith(
                expect.stringContaining('AWS DocumentDB (MongoDB-compatible)')
            );
        });

        it('should complete setup successfully for PostgreSQL', async () => {
            mockValidator.getDatabaseType.mockReturnValue({
                dbType: 'postgresql',
            });
            mockValidator.checkPrismaClientGenerated.mockReturnValue({
                generated: false, // Client doesn't exist, will generate
            });
            mockRunner.checkDatabaseState.mockResolvedValue({
                upToDate: false,
            });

            await dbSetupCommand({ verbose: false, stage: 'development' });

            expect(
                mockValidator.checkPrismaClientGenerated
            ).toHaveBeenCalledWith('postgresql');
            expect(mockRunner.runPrismaGenerate).toHaveBeenCalledWith(
                'postgresql',
                false
            );
            expect(mockRunner.runPrismaMigrate).toHaveBeenCalled();
            expect(mockProcessExit).not.toHaveBeenCalled();
        });

        it('should skip migrations when already up-to-date (PostgreSQL)', async () => {
            mockValidator.getDatabaseType.mockReturnValue({
                dbType: 'postgresql',
            });
            mockRunner.checkDatabaseState.mockResolvedValue({ upToDate: true });
            mockRunner.getMigrationCommand.mockReturnValue('deploy');

            await dbSetupCommand({ verbose: false, stage: 'production' });

            expect(mockRunner.runPrismaMigrate).not.toHaveBeenCalled();
            expect(mockConsoleLog).toHaveBeenCalledWith(
                expect.stringContaining('already up-to-date')
            );
        });

        it('should use migrate dev in development stage', async () => {
            mockValidator.getDatabaseType.mockReturnValue({
                dbType: 'postgresql',
            });
            mockRunner.getMigrationCommand.mockReturnValue('dev');
            mockRunner.checkDatabaseState.mockResolvedValue({
                upToDate: false,
            });

            await dbSetupCommand({ verbose: false, stage: 'development' });

            expect(mockRunner.getMigrationCommand).toHaveBeenCalledWith(
                'development'
            );
            expect(mockRunner.runPrismaMigrate).toHaveBeenCalledWith(
                'dev',
                false
            );
        });

        it('should use migrate deploy in production stage', async () => {
            mockValidator.getDatabaseType.mockReturnValue({
                dbType: 'postgresql',
            });
            mockRunner.getMigrationCommand.mockReturnValue('deploy');
            mockRunner.checkDatabaseState.mockResolvedValue({
                upToDate: false,
            });

            await dbSetupCommand({ verbose: false, stage: 'production' });

            expect(mockRunner.getMigrationCommand).toHaveBeenCalledWith(
                'production'
            );
            expect(mockRunner.runPrismaMigrate).toHaveBeenCalledWith(
                'deploy',
                false
            );
        });

        it('should respect --verbose flag', async () => {
            mockValidator.checkPrismaClientGenerated.mockReturnValue({
                generated: false, // Client doesn't exist, will generate
            });

            await dbSetupCommand({ verbose: true, stage: 'development' });

            expect(mockRunner.runPrismaGenerate).toHaveBeenCalledWith(
                'mongodb',
                true
            );
        });

        it('should load .env file from project root', async () => {
            await dbSetupCommand({ verbose: false, stage: 'development' });

            expect(dotenv.config).toHaveBeenCalledWith(
                expect.objectContaining({
                    path: expect.stringContaining('.env'),
                })
            );
        });
    });

    describe('Conditional Client Generation', () => {
        it('should skip generation when client already exists', async () => {
            // Client exists
            mockValidator.checkPrismaClientGenerated.mockReturnValue({
                generated: true,
                path: '/path/to/client',
            });

            await dbSetupCommand({ verbose: false, stage: 'development' });

            // Should check if client exists
            expect(
                mockValidator.checkPrismaClientGenerated
            ).toHaveBeenCalledWith('mongodb');
            // Should NOT call generate
            expect(mockRunner.runPrismaGenerate).not.toHaveBeenCalled();
            expect(mockProcessExit).not.toHaveBeenCalled();
        });

        it('should generate client when it does not exist', async () => {
            // Client does NOT exist
            mockValidator.checkPrismaClientGenerated.mockReturnValue({
                generated: false,
                error: 'Client not found',
            });

            await dbSetupCommand({ verbose: false, stage: 'development' });

            // Should check if client exists
            expect(
                mockValidator.checkPrismaClientGenerated
            ).toHaveBeenCalledWith('mongodb');
            // Should call generate
            expect(mockRunner.runPrismaGenerate).toHaveBeenCalledWith(
                'mongodb',
                false
            );
            // Should complete setup
            expect(mockProcessExit).not.toHaveBeenCalled();
        });

        it('should regenerate client when --force flag is provided', async () => {
            // Client exists
            mockValidator.checkPrismaClientGenerated.mockReturnValue({
                generated: true,
                path: '/path/to/client',
            });

            await dbSetupCommand({
                verbose: false,
                stage: 'development',
                force: true,
            });

            // Should check if client exists
            expect(
                mockValidator.checkPrismaClientGenerated
            ).toHaveBeenCalledWith('mongodb');
            // Should STILL call generate because of --force
            expect(mockRunner.runPrismaGenerate).toHaveBeenCalledWith(
                'mongodb',
                false
            );
            // Should complete setup
            expect(mockProcessExit).not.toHaveBeenCalled();
        });

        it('should show client location in verbose mode when skipping generation', async () => {
            mockValidator.checkPrismaClientGenerated.mockReturnValue({
                generated: true,
                path: '/path/to/prisma/client',
            });

            await dbSetupCommand({ verbose: true, stage: 'development' });

            // Should log the client path
            expect(mockConsoleLog).toHaveBeenCalledWith(
                expect.stringContaining('/path/to/prisma/client')
            );
            expect(mockRunner.runPrismaGenerate).not.toHaveBeenCalled();
        });

        it('should generate for different database types', async () => {
            // Test PostgreSQL
            mockValidator.getDatabaseType.mockReturnValue({
                dbType: 'postgresql',
            });
            mockValidator.checkPrismaClientGenerated.mockReturnValue({
                generated: false,
            });
            mockRunner.checkDatabaseState.mockResolvedValue({
                upToDate: false,
            });

            await dbSetupCommand({ verbose: false, stage: 'development' });

            expect(
                mockValidator.checkPrismaClientGenerated
            ).toHaveBeenCalledWith('postgresql');
            expect(mockRunner.runPrismaGenerate).toHaveBeenCalledWith(
                'postgresql',
                false
            );
        });
    });

    describe('Failure Cases - Validation', () => {
        it('should fail when DATABASE_URL missing', async () => {
            mockValidator.validateDatabaseUrl.mockReturnValue({
                valid: false,
                error: 'DATABASE_URL not found',
            });

            await dbSetupCommand({});

            expect(mockConsoleError).toHaveBeenCalled();
            expect(mockProcessExit).toHaveBeenCalledWith(1);
        });

        it('should fail when DATABASE_URL is empty', async () => {
            mockValidator.validateDatabaseUrl.mockReturnValue({
                valid: false,
                error: 'DATABASE_URL is empty',
            });

            await dbSetupCommand({});

            expect(
                mockErrorMessages.getDatabaseUrlMissingError
            ).toHaveBeenCalled();
            expect(mockProcessExit).toHaveBeenCalledWith(1);
        });

        it('should fail when database type not configured', async () => {
            mockValidator.getDatabaseType.mockReturnValue({
                error: 'Database not configured',
            });

            await dbSetupCommand({});

            expect(
                mockErrorMessages.getDatabaseTypeNotConfiguredError
            ).toHaveBeenCalled();
            expect(mockProcessExit).toHaveBeenCalledWith(1);
        });

        it('should fail when backend definition not found', async () => {
            mockValidator.getDatabaseType.mockReturnValue({
                error: 'Backend not found',
            });

            await dbSetupCommand({});

            expect(mockProcessExit).toHaveBeenCalledWith(1);
        });
    });

    describe('Failure Cases - Prisma Operations', () => {
        it('should fail when prisma generate fails', async () => {
            mockValidator.checkPrismaClientGenerated.mockReturnValue({
                generated: false, // Client doesn't exist, will attempt generation
            });
            mockRunner.runPrismaGenerate.mockResolvedValue({
                success: false,
                error: 'Generation failed',
            });

            await dbSetupCommand({});

            expect(
                mockErrorMessages.getPrismaCommandError
            ).toHaveBeenCalledWith('generate', 'Generation failed');
            expect(mockProcessExit).toHaveBeenCalledWith(1);
        });

        it('should fail when migrate dev fails (PostgreSQL)', async () => {
            mockValidator.getDatabaseType.mockReturnValue({
                dbType: 'postgresql',
            });
            mockRunner.getMigrationCommand.mockReturnValue('dev');
            mockRunner.checkDatabaseState.mockResolvedValue({
                upToDate: false,
            });
            mockRunner.runPrismaMigrate.mockResolvedValue({
                success: false,
                error: 'Migration failed',
            });

            await dbSetupCommand({ stage: 'development' });

            expect(
                mockErrorMessages.getPrismaCommandError
            ).toHaveBeenCalledWith('migrate', 'Migration failed');
            expect(mockProcessExit).toHaveBeenCalledWith(1);
        });

        it('should fail when migrate deploy fails (PostgreSQL)', async () => {
            mockValidator.getDatabaseType.mockReturnValue({
                dbType: 'postgresql',
            });
            mockRunner.getMigrationCommand.mockReturnValue('deploy');
            mockRunner.checkDatabaseState.mockResolvedValue({
                upToDate: false,
            });
            mockRunner.runPrismaMigrate.mockResolvedValue({
                success: false,
                error: 'Deploy failed',
            });

            await dbSetupCommand({ stage: 'production' });

            expect(mockProcessExit).toHaveBeenCalledWith(1);
        });

        it('should fail when db push fails (MongoDB)', async () => {
            mockRunner.runPrismaDbPush.mockResolvedValue({
                success: false,
                error: 'Push failed',
            });

            await dbSetupCommand({});

            expect(
                mockErrorMessages.getPrismaCommandError
            ).toHaveBeenCalledWith('db push', 'Push failed');
            expect(mockProcessExit).toHaveBeenCalledWith(1);
        });

        it('should fail when schema file missing', async () => {
            mockValidator.checkPrismaClientGenerated.mockReturnValue({
                generated: false, // Client doesn't exist, will attempt generation
            });
            mockRunner.runPrismaGenerate.mockResolvedValue({
                success: false,
                error: 'Schema not found',
            });

            await dbSetupCommand({});

            expect(mockProcessExit).toHaveBeenCalledWith(1);
        });
    });

    describe('Error Message Validation', () => {
        it('should display helpful error for missing DATABASE_URL', async () => {
            mockValidator.validateDatabaseUrl.mockReturnValue({
                valid: false,
                error: 'Not found',
            });

            await dbSetupCommand({});

            expect(
                mockErrorMessages.getDatabaseUrlMissingError
            ).toHaveBeenCalled();
        });

        it('should display helpful error for Prisma failures', async () => {
            mockValidator.checkPrismaClientGenerated.mockReturnValue({
                generated: false, // Client doesn't exist, will attempt generation
            });
            mockRunner.runPrismaGenerate.mockResolvedValue({
                success: false,
                error: 'Some error',
                output: 'Detailed output',
            });

            await dbSetupCommand({});

            expect(mockErrorMessages.getPrismaCommandError).toHaveBeenCalled();
        });

        it('should exit with code 1 on failure', async () => {
            mockValidator.validateDatabaseUrl.mockReturnValue({
                valid: false,
            });

            await dbSetupCommand({});

            expect(mockProcessExit).toHaveBeenCalledWith(1);
        });

        it('should not exit with code 0 on failure', async () => {
            mockValidator.validateDatabaseUrl.mockReturnValue({
                valid: false,
            });

            await dbSetupCommand({});

            expect(mockProcessExit).not.toHaveBeenCalledWith(0);
        });

        it('should display success message on completion', async () => {
            await dbSetupCommand({ stage: 'development' });

            expect(
                mockErrorMessages.getDatabaseSetupSuccess
            ).toHaveBeenCalledWith('mongodb', 'development');
        });
    });

    describe('Verbose Output', () => {
        it('should show verbose output when flag enabled', async () => {
            await dbSetupCommand({ verbose: true });

            // Verbose calls should show console output
            expect(mockConsoleLog).toHaveBeenCalled();
        });

        it('should pass verbose flag to Prisma commands', async () => {
            mockValidator.checkPrismaClientGenerated.mockReturnValue({
                generated: false, // Client doesn't exist, will generate
            });

            await dbSetupCommand({ verbose: true });

            expect(mockRunner.runPrismaGenerate).toHaveBeenCalledWith(
                'mongodb',
                true
            );
            expect(mockRunner.runPrismaDbPush).toHaveBeenCalledWith(true);
        });

        it('should not show verbose output when flag disabled', async () => {
            mockValidator.checkPrismaClientGenerated.mockReturnValue({
                generated: false, // Client doesn't exist, will generate
            });

            await dbSetupCommand({ verbose: false });

            expect(mockRunner.runPrismaGenerate).toHaveBeenCalledWith(
                'mongodb',
                false
            );
        });
    });

    describe('Stage Handling', () => {
        it('should use provided stage option', async () => {
            mockValidator.getDatabaseType.mockReturnValue({
                dbType: 'postgresql',
            });
            mockRunner.checkDatabaseState.mockResolvedValue({
                upToDate: false,
            });

            await dbSetupCommand({ stage: 'production' });

            expect(mockRunner.getMigrationCommand).toHaveBeenCalledWith(
                'production'
            );
        });

        it('should default to development when no stage provided', async () => {
            mockValidator.getDatabaseType.mockReturnValue({
                dbType: 'postgresql',
            });
            mockRunner.checkDatabaseState.mockResolvedValue({
                upToDate: false,
            });

            await dbSetupCommand({});

            expect(mockRunner.getMigrationCommand).toHaveBeenCalled();
        });

        it('should handle different stage values', async () => {
            mockValidator.getDatabaseType.mockReturnValue({
                dbType: 'postgresql',
            });
            mockRunner.checkDatabaseState.mockResolvedValue({
                upToDate: false,
            });

            await dbSetupCommand({ stage: 'staging' });

            expect(mockRunner.getMigrationCommand).toHaveBeenCalledWith(
                'staging'
            );
        });
    });
});
