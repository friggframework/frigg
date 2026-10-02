/**
 * Test suite for deploy command
 *
 * Tests the serverless deployment functionality including:
 * - Command execution with spawn
 * - Stage option handling
 * - Environment variable filtering and propagation
 * - SLS_STAGE propagation for resource discovery
 * - Error handling
 */

// Mock dependencies BEFORE requiring modules
// The app definition validation step is tested in validate-command/.
jest.mock('../../../validate-command', () => ({ preflightValidation: jest.fn(() => true) }));

jest.mock('child_process', () => ({
  spawn: jest.fn()
}));

// Partial mock: only existsSync is stubbed, the rest of fs stays real (a
// bare { existsSync } mock breaks any dependency that reads fs.constants).
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn()
}));

// The post-deployment health check calls the doctor command (real AWS).
jest.mock('../../../doctor-command', () => ({
  doctorCommand: jest.fn().mockResolvedValue(undefined)
}));

// Require after mocks
const { spawn } = require('child_process');
const fs = require('fs');
const { deployCommand } = require('../../../deploy-command');

describe('CLI Command: deploy', () => {
  let consoleLogSpy;
  let consoleWarnSpy;
  let consoleErrorSpy;
  let mockChildProcess;
  let childOutcome;
  let exitSpy;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock console methods
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    // Mock child process. deployCommand awaits the child's exit, so the mock
    // emits `childOutcome` (default: a clean exit) once its handler is wired.
    childOutcome = { event: 'close', value: 0 };
    mockChildProcess = {
      on: jest.fn((event, handler) => {
        if (event === childOutcome.event) {
          setImmediate(() => handler(childOutcome.value));
        }
        return mockChildProcess;
      })
    };
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});

    // Mock successful spawn by default
    spawn.mockReturnValue(mockChildProcess);

    // Mock fs.existsSync to return false (no app definition)
    fs.existsSync.mockReturnValue(false);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  describe('Success Cases', () => {
    it('should spawn serverless with default stage', async () => {
      await deployCommand({ stage: 'dev' });

      expect(spawn).toHaveBeenCalledWith(
        'osls',
        ['deploy', '--config', 'infrastructure.js', '--stage', 'dev'],
        expect.objectContaining({
          cwd: expect.any(String),
          stdio: 'inherit'
        })
      );
    });

    it('should spawn serverless with production stage', async () => {
      await deployCommand({ stage: 'production' });

      expect(spawn).toHaveBeenCalledWith(
        'osls',
        expect.arrayContaining(['--stage', 'production']),
        expect.any(Object)
      );
    });

    it('should spawn serverless with qa stage', async () => {
      await deployCommand({ stage: 'qa' });

      expect(spawn).toHaveBeenCalledWith(
        'osls',
        expect.arrayContaining(['--stage', 'qa']),
        expect.any(Object)
      );
    });

    it('should spawn serverless with --force flag when force option is true', async () => {
      await deployCommand({ stage: 'dev', force: true });

      expect(spawn).toHaveBeenCalledWith(
        'osls',
        ['deploy', '--config', 'infrastructure.js', '--stage', 'dev', '--force'],
        expect.objectContaining({
          cwd: expect.any(String),
          stdio: 'inherit'
        })
      );
    });

    it('should spawn serverless without --force flag when force option is false', async () => {
      await deployCommand({ stage: 'dev', force: false });

      expect(spawn).toHaveBeenCalledWith(
        'osls',
        ['deploy', '--config', 'infrastructure.js', '--stage', 'dev'],
        expect.objectContaining({
          cwd: expect.any(String),
          stdio: 'inherit'
        })
      );
    });

    it('should spawn serverless without --force flag when force option is undefined', async () => {
      await deployCommand({ stage: 'dev' });

      expect(spawn).toHaveBeenCalledWith(
        'osls',
        ['deploy', '--config', 'infrastructure.js', '--stage', 'dev'],
        expect.objectContaining({
          cwd: expect.any(String),
          stdio: 'inherit'
        })
      );
    });

    it('should use process.cwd() as working directory', async () => {
      await deployCommand({ stage: 'dev' });

      const call = spawn.mock.calls[0];
      const options = call[2];

      expect(options.cwd).toBe(process.cwd());
    });

    it('should use stdio inherit for output streaming', async () => {
      await deployCommand({ stage: 'dev' });

      const call = spawn.mock.calls[0];
      const options = call[2];

      expect(options.stdio).toBe('inherit');
    });

    it('should set SLS_STAGE environment variable to match stage option', async () => {
      await deployCommand({ stage: 'qa' });

      const call = spawn.mock.calls[0];
      const options = call[2];

      // Verify SLS_STAGE is set for discovery to use
      expect(options.env.SLS_STAGE).toBe('qa');
    });

    it('should set SLS_STAGE for production stage', async () => {
      await deployCommand({ stage: 'production' });

      const call = spawn.mock.calls[0];
      const options = call[2];

      expect(options.env.SLS_STAGE).toBe('production');
    });

    it('should set SLS_STAGE for dev stage', async () => {
      await deployCommand({ stage: 'dev' });

      const call = spawn.mock.calls[0];
      const options = call[2];

      expect(options.env.SLS_STAGE).toBe('dev');
    });

    it('should use infrastructure.js as config file', async () => {
      await deployCommand({ stage: 'dev' });

      expect(spawn).toHaveBeenCalledWith(
        'osls',
        expect.arrayContaining(['--config', 'infrastructure.js']),
        expect.any(Object)
      );
    });

    it('should log deployment start messages', async () => {
      await deployCommand({ stage: 'dev' });

      expect(consoleLogSpy).toHaveBeenCalledWith('Deploying the serverless application...');
      expect(consoleLogSpy).toHaveBeenCalledWith('🚀 Deploying serverless application...');
    });

    it('should include essential system environment variables', async () => {
      process.env.PATH = '/usr/bin';
      process.env.HOME = '/home/user';
      process.env.USER = 'testuser';

      await deployCommand({ stage: 'dev' });

      const call = spawn.mock.calls[0];
      const options = call[2];

      expect(options.env.PATH).toBe('/usr/bin');
      expect(options.env.HOME).toBe('/home/user');
      expect(options.env.USER).toBe('testuser');
    });

    it('should include AWS environment variables', async () => {
      process.env.AWS_REGION = 'us-east-1';
      process.env.AWS_PROFILE = 'test-profile';
      process.env.AWS_ACCESS_KEY_ID = 'test-key';

      await deployCommand({ stage: 'dev' });

      const call = spawn.mock.calls[0];
      const options = call[2];

      expect(options.env.AWS_REGION).toBe('us-east-1');
      expect(options.env.AWS_PROFILE).toBe('test-profile');
      expect(options.env.AWS_ACCESS_KEY_ID).toBe('test-key');

      delete process.env.AWS_REGION;
      delete process.env.AWS_PROFILE;
      delete process.env.AWS_ACCESS_KEY_ID;
    });

    it('should register error handler', async () => {
      await deployCommand({ stage: 'dev' });

      expect(mockChildProcess.on).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('should register close handler', async () => {
      await deployCommand({ stage: 'dev' });

      expect(mockChildProcess.on).toHaveBeenCalledWith('close', expect.any(Function));
    });
  });

  describe('Environment Variable Filtering', () => {
    it('should filter environment variables when app definition exists', async () => {
      // Mock app definition with environment config
      fs.existsSync.mockReturnValue(true);
      jest.mock(
        process.cwd() + '/index.js',
        () => ({
          Definition: {
            environment: {
              DATABASE_URL: true,
              API_KEY: true
            }
          }
        }),
        { virtual: true }
      );

      process.env.DATABASE_URL = 'postgres://localhost';
      process.env.API_KEY = 'test-key';
      process.env.RANDOM_VAR = 'should-not-be-included';

      await deployCommand({ stage: 'dev' });

      const call = spawn.mock.calls[0];
      const options = call[2];

      // Should include app-defined variables
      expect(options.env.DATABASE_URL).toBe('postgres://localhost');
      expect(options.env.API_KEY).toBe('test-key');

      // Should NOT include non-app-defined variables (except system/AWS)
      expect(options.env.RANDOM_VAR).toBeUndefined();

      delete process.env.DATABASE_URL;
      delete process.env.API_KEY;
      delete process.env.RANDOM_VAR;
    });
  });

  describe('Error Handling', () => {
    it('should log and reject when spawn fails', async () => {
      childOutcome = { event: 'error', value: new Error('Spawn failed') };

      await expect(deployCommand({ stage: 'dev' })).rejects.toThrow('Spawn failed');

      expect(consoleErrorSpy).toHaveBeenCalledWith('Error executing command: Spawn failed');
    });

    it('should log and exit with the code when child process exits non-zero', async () => {
      childOutcome = { event: 'close', value: 1 };

      await deployCommand({ stage: 'dev' });

      expect(consoleLogSpy).toHaveBeenCalledWith('Child process exited with code 1');
      expect(exitSpy).toHaveBeenCalledWith(1);
    });

    it('should NOT log when child process exits with zero code', async () => {
      await deployCommand({ stage: 'dev' });

      // Should not log exit message for success
      expect(consoleLogSpy).not.toHaveBeenCalledWith('Child process exited with code 0');
      expect(exitSpy).not.toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith('\n✓ Deployment completed successfully!');
    });
  });
});
