/**
 * Test suite for the frigg start command
 *
 * These tests ensure that the start command properly:
 * 1. Sets FRIGG_SKIP_AWS_DISCOVERY=true in the parent process to skip AWS API calls
 * 2. Suppresses AWS SDK maintenance mode warnings
 * 3. Spawns serverless with correct configuration
 * 4. Validates database configuration before starting
 *
 * This fixes the issue where frigg start would attempt AWS discovery during local development,
 * causing unnecessary AWS API calls and potential failures when AWS credentials aren't available.
 */

// Mock dependencies BEFORE importing startCommand
const mockValidator = {
    validateDatabaseUrl: jest.fn(),
    getDatabaseType: jest.fn(),
    checkPrismaClientGenerated: jest.fn()
};

jest.mock('node:child_process', () => ({
    spawn: jest.fn(),
}));

jest.mock('../utils/database-validator', () => mockValidator);
jest.mock('dotenv');

const { spawn } = require('node:child_process');
const { startCommand } = require('./index');
const { createMockDatabaseValidator } = require('../__tests__/utils/prisma-mock');
const dotenv = require('dotenv');

describe('startCommand', () => {
    let mockChildProcess;
    let mockProcessExit;

    beforeEach(() => {
        // Mock process.exit to throw error and stop execution (prevents actual exits)
        const exitError = new Error('process.exit called');
        exitError.code = 'PROCESS_EXIT';
        mockProcessExit = jest.spyOn(process, 'exit').mockImplementation(() => {
            throw exitError;
        });

        // Reset mocks
        jest.clearAllMocks();

        // Re-apply process.exit mock after clearAllMocks
        mockProcessExit = jest.spyOn(process, 'exit').mockImplementation(() => {
            throw exitError;
        });

        // Set up default database validator mocks for all tests
        const defaultValidator = createMockDatabaseValidator();
        mockValidator.validateDatabaseUrl.mockReturnValue(defaultValidator.validateDatabaseUrl());
        mockValidator.getDatabaseType.mockReturnValue(defaultValidator.getDatabaseType());
        mockValidator.checkPrismaClientGenerated.mockReturnValue(defaultValidator.checkPrismaClientGenerated());

        // Mock dotenv
        dotenv.config = jest.fn();

        // Clear environment variables
        delete process.env.AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE;
        delete process.env.FRIGG_SKIP_AWS_DISCOVERY;

        // Create a mock child process
        mockChildProcess = {
            on: jest.fn(),
            stdout: { on: jest.fn() },
            stderr: { on: jest.fn() },
        };

        spawn.mockReturnValue(mockChildProcess);
    });

    afterEach(() => {
        // Restore process.exit
        if (mockProcessExit) {
            mockProcessExit.mockRestore();
        }

        // Clean up environment
        delete process.env.AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE;
        delete process.env.FRIGG_SKIP_AWS_DISCOVERY;
    });

    it('should set FRIGG_SKIP_AWS_DISCOVERY to true in the parent process', async () => {
        const options = { stage: 'dev' };

        await startCommand(options);

        // Verify the environment variable is set in the parent process
        expect(process.env.FRIGG_SKIP_AWS_DISCOVERY).toBe('true');
    });

    it('should set AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE to suppress warnings', async () => {
        const options = { stage: 'dev' };

        await startCommand(options);

        expect(process.env.AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE).toBe('1');
    });

    it('should spawn serverless with correct arguments', async () => {
        const options = { stage: 'prod' };

        await startCommand(options);

        expect(spawn).toHaveBeenCalledWith(
            'serverless',
            ['offline', '--config', 'infrastructure.js', '--stage', 'prod'],
            expect.objectContaining({
                cwd: expect.any(String),
                stdio: 'inherit',
                env: expect.objectContaining({
                    FRIGG_SKIP_AWS_DISCOVERY: 'true',
                }),
            })
        );
    });

    it('should include verbose flag when verbose option is enabled', async () => {
        const options = { stage: 'dev', verbose: true };

        await startCommand(options);

        expect(spawn).toHaveBeenCalledWith(
            'serverless',
            ['offline', '--config', 'infrastructure.js', '--stage', 'dev', '--verbose'],
            expect.any(Object)
        );
    });

    it('should pass FRIGG_SKIP_AWS_DISCOVERY in spawn environment', async () => {
        const options = { stage: 'dev' };

        await startCommand(options);

        const spawnCall = spawn.mock.calls[0];
        const spawnOptions = spawnCall[2];

        expect(spawnOptions.env).toHaveProperty('FRIGG_SKIP_AWS_DISCOVERY', 'true');
    });

    it('should handle child process errors', async () => {
        const options = { stage: 'dev' };
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

        await startCommand(options);

        // Simulate an error
        const errorCallback = mockChildProcess.on.mock.calls.find(call => call[0] === 'error')[1];
        const testError = new Error('Test error');
        errorCallback(testError);

        expect(consoleErrorSpy).toHaveBeenCalledWith('Error executing command: Test error');

        consoleErrorSpy.mockRestore();
    });

    it('should handle child process exit with non-zero code', async () => {
        const options = { stage: 'dev' };
        const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

        await startCommand(options);

        // Simulate exit with error code
        const closeCallback = mockChildProcess.on.mock.calls.find(call => call[0] === 'close')[1];
        closeCallback(1);

        expect(consoleLogSpy).toHaveBeenCalledWith('Child process exited with code 1');

        consoleLogSpy.mockRestore();
    });

    it('should not log on successful exit', async () => {
        const options = { stage: 'dev' };
        const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

        await startCommand(options);

        // Clear the spy calls from startCommand execution
        consoleLogSpy.mockClear();

        // Simulate successful exit
        const closeCallback = mockChildProcess.on.mock.calls.find(call => call[0] === 'close')[1];
        closeCallback(0);

        // Should not log anything for successful exit
        expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining('exited'));

        consoleLogSpy.mockRestore();
    });

    describe('Database Pre-flight Validation', () => {
        let mockConsoleError;

        beforeEach(() => {
            // Mock console.error (all other mocks are set up in outer beforeEach)
            mockConsoleError = jest.spyOn(console, 'error').mockImplementation();
        });

        afterEach(() => {
            mockConsoleError.mockRestore();
        });

        it('should pass pre-flight checks when database valid', async () => {
            const options = { stage: 'dev' };

            await startCommand(options);

            expect(mockValidator.validateDatabaseUrl).toHaveBeenCalled();
            expect(mockValidator.getDatabaseType).toHaveBeenCalled();
            expect(mockValidator.checkPrismaClientGenerated).toHaveBeenCalled();
            expect(mockProcessExit).not.toHaveBeenCalled();
            expect(spawn).toHaveBeenCalled();
        });

        it('should fail when DATABASE_URL missing', async () => {
            mockValidator.validateDatabaseUrl.mockReturnValue({
                valid: false,
                error: 'DATABASE_URL not found'
            });

            await expect(startCommand({})).rejects.toThrow('process.exit called');

            expect(mockConsoleError).toHaveBeenCalled();
            expect(mockProcessExit).toHaveBeenCalledWith(1);
            expect(spawn).not.toHaveBeenCalled();
        });

        it('should fail when database type not configured', async () => {
            mockValidator.getDatabaseType.mockReturnValue({
                error: 'Database not configured'
            });

            await expect(startCommand({})).rejects.toThrow('process.exit called');

            expect(mockConsoleError).toHaveBeenCalled();
            expect(mockProcessExit).toHaveBeenCalledWith(1);
            expect(spawn).not.toHaveBeenCalled();
        });

        it('should fail when Prisma client not generated', async () => {
            mockValidator.checkPrismaClientGenerated.mockReturnValue({
                generated: false,
                error: 'Client not found'
            });

            await expect(startCommand({})).rejects.toThrow('process.exit called');

            expect(mockConsoleError).toHaveBeenCalled();
            expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('frigg db:setup'));
            expect(mockProcessExit).toHaveBeenCalledWith(1);
            expect(spawn).not.toHaveBeenCalled();
        });

        it('should suggest running frigg db:setup when client missing', async () => {
            mockValidator.checkPrismaClientGenerated.mockReturnValue({
                generated: false,
                error: 'Client not generated'
            });

            await expect(startCommand({})).rejects.toThrow('process.exit called');

            expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('frigg db:setup'));
        });

        it('should exit with code 1 on validation failure', async () => {
            mockValidator.validateDatabaseUrl.mockReturnValue({
                valid: false
            });

            await expect(startCommand({})).rejects.toThrow('process.exit called');

            expect(mockProcessExit).toHaveBeenCalledWith(1);
        });

        it('should continue to serverless start when validation passes', async () => {
            await startCommand({ stage: 'dev' });

            expect(spawn).toHaveBeenCalledWith(
                'serverless',
                expect.arrayContaining(['offline']),
                expect.any(Object)
            );
        });

        it('should load .env before validation', async () => {
            await startCommand({});

            expect(dotenv.config).toHaveBeenCalledWith(expect.objectContaining({
                path: expect.stringContaining('.env')
            }));
        });
    });
});