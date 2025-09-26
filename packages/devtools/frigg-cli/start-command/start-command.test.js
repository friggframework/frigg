/**
 * Test suite for the frigg start command
 *
 * These tests ensure that the start command properly:
 * 1. Sets FRIGG_SKIP_AWS_DISCOVERY=true in the parent process to skip AWS API calls
 * 2. Suppresses AWS SDK maintenance mode warnings
 * 3. Spawns serverless with correct configuration
 *
 * This fixes the issue where frigg start would attempt AWS discovery during local development,
 * causing unnecessary AWS API calls and potential failures when AWS credentials aren't available.
 */

const { spawn } = require('node:child_process');
const { startCommand } = require('./index');

// Mock the spawn function
jest.mock('node:child_process', () => ({
    spawn: jest.fn(),
}));

describe('startCommand', () => {
    let mockChildProcess;

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();

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
        // Clean up environment
        delete process.env.AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE;
        delete process.env.FRIGG_SKIP_AWS_DISCOVERY;
    });

    it('should set FRIGG_SKIP_AWS_DISCOVERY to true in the parent process', () => {
        const options = { stage: 'dev' };

        startCommand(options);

        // Verify the environment variable is set in the parent process
        expect(process.env.FRIGG_SKIP_AWS_DISCOVERY).toBe('true');
    });

    it('should set AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE to suppress warnings', () => {
        const options = { stage: 'dev' };

        startCommand(options);

        expect(process.env.AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE).toBe('1');
    });

    it('should spawn serverless with correct arguments', () => {
        const options = { stage: 'prod' };

        startCommand(options);

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

    it('should include verbose flag when verbose option is enabled', () => {
        const options = { stage: 'dev', verbose: true };

        startCommand(options);

        expect(spawn).toHaveBeenCalledWith(
            'serverless',
            ['offline', '--config', 'infrastructure.js', '--stage', 'dev', '--verbose'],
            expect.any(Object)
        );
    });

    it('should pass FRIGG_SKIP_AWS_DISCOVERY in spawn environment', () => {
        const options = { stage: 'dev' };

        startCommand(options);

        const spawnCall = spawn.mock.calls[0];
        const spawnOptions = spawnCall[2];

        expect(spawnOptions.env).toHaveProperty('FRIGG_SKIP_AWS_DISCOVERY', 'true');
    });

    it('should handle child process errors', () => {
        const options = { stage: 'dev' };
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

        startCommand(options);

        // Simulate an error
        const errorCallback = mockChildProcess.on.mock.calls.find(call => call[0] === 'error')[1];
        const testError = new Error('Test error');
        errorCallback(testError);

        expect(consoleErrorSpy).toHaveBeenCalledWith('Error executing command: Test error');

        consoleErrorSpy.mockRestore();
    });

    it('should handle child process exit with non-zero code', () => {
        const options = { stage: 'dev' };
        const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

        startCommand(options);

        // Simulate exit with error code
        const closeCallback = mockChildProcess.on.mock.calls.find(call => call[0] === 'close')[1];
        closeCallback(1);

        expect(consoleLogSpy).toHaveBeenCalledWith('Child process exited with code 1');

        consoleLogSpy.mockRestore();
    });

    it('should not log on successful exit', () => {
        const options = { stage: 'dev' };
        const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

        startCommand(options);

        // Clear the spy calls from startCommand execution
        consoleLogSpy.mockClear();

        // Simulate successful exit
        const closeCallback = mockChildProcess.on.mock.calls.find(call => call[0] === 'close')[1];
        closeCallback(0);

        // Should not log anything for successful exit
        expect(consoleLogSpy).not.toHaveBeenCalledWith(expect.stringContaining('exited'));

        consoleLogSpy.mockRestore();
    });
});