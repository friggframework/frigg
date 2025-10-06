/**
 * Test suite for build command
 *
 * Tests the serverless package build functionality including:
 * - Command execution with spawnSync
 * - Stage option handling
 * - Verbose flag support
 * - Environment variable setup
 * - Error handling and process exit
 */

// Mock dependencies BEFORE requiring modules
jest.mock('child_process', () => ({
  spawnSync: jest.fn()
}));

// Require after mocks
const { spawnSync } = require('child_process');
const { buildCommand } = require('../../../build-command');

describe('CLI Command: build', () => {
  let consoleLogSpy;
  let consoleErrorSpy;
  let processExitSpy;
  let originalCwd;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock console methods
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    // Mock process.exit to prevent actual exit
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation();

    // Mock successful serverless execution by default
    spawnSync.mockReturnValue({ status: 0 });

    // Store original cwd for restoration
    originalCwd = process.cwd();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
  });

  describe('Success Cases', () => {
    it('should spawn serverless with default stage', async () => {
      await buildCommand({ stage: 'dev' });

      expect(spawnSync).toHaveBeenCalledWith(
        'serverless',
        ['package', '--config', 'infrastructure.js', '--stage', 'dev'],
        expect.objectContaining({
          cwd: expect.any(String),
          stdio: 'inherit',
          shell: true
        })
      );
    });

    it('should spawn serverless with production stage', async () => {
      await buildCommand({ stage: 'production' });

      expect(spawnSync).toHaveBeenCalledWith(
        'serverless',
        expect.arrayContaining(['--stage', 'production']),
        expect.any(Object)
      );
    });

    it('should spawn serverless with staging stage', async () => {
      await buildCommand({ stage: 'staging' });

      expect(spawnSync).toHaveBeenCalledWith(
        'serverless',
        expect.arrayContaining(['--stage', 'staging']),
        expect.any(Object)
      );
    });

    it('should append verbose flag when verbose option is true', async () => {
      await buildCommand({ stage: 'dev', verbose: true });

      expect(spawnSync).toHaveBeenCalledWith(
        'serverless',
        expect.arrayContaining(['--verbose']),
        expect.any(Object)
      );
    });

    it('should NOT append verbose flag when verbose option is false', async () => {
      await buildCommand({ stage: 'dev', verbose: false });

      const call = spawnSync.mock.calls[0];
      const args = call[1];

      expect(args).not.toContain('--verbose');
    });

    it('should use process.cwd() as working directory', async () => {
      await buildCommand({ stage: 'dev' });

      const call = spawnSync.mock.calls[0];
      const options = call[2];

      // Verify ACTUAL cwd value, not generic check
      expect(options.cwd).toBe(process.cwd());
    });

    it('should use stdio inherit for output streaming', async () => {
      await buildCommand({ stage: 'dev' });

      const call = spawnSync.mock.calls[0];
      const options = call[2];

      expect(options.stdio).toBe('inherit');
    });

    it('should use shell mode for execution', async () => {
      await buildCommand({ stage: 'dev' });

      const call = spawnSync.mock.calls[0];
      const options = call[2];

      expect(options.shell).toBe(true);
    });

    it('should set NODE_PATH environment variable with actual resolved path', async () => {
      await buildCommand({ stage: 'dev' });

      const call = spawnSync.mock.calls[0];
      const options = call[2];

      // Verify ACTUAL resolved path, not just "contains node_modules"
      const path = require('path');
      const expectedNodePath = path.resolve(process.cwd(), 'node_modules');

      expect(options.env.NODE_PATH).toBe(expectedNodePath);
    });

    it('should pass through all process.env variables', async () => {
      // Set a test env var
      process.env.TEST_VAR = 'test-value';

      await buildCommand({ stage: 'dev' });

      const call = spawnSync.mock.calls[0];
      const options = call[2];

      // Verify parent env vars are passed through
      expect(options.env.TEST_VAR).toBe('test-value');

      delete process.env.TEST_VAR;
    });

    it('should use infrastructure.js as config file', async () => {
      await buildCommand({ stage: 'dev' });

      expect(spawnSync).toHaveBeenCalledWith(
        'serverless',
        expect.arrayContaining(['--config', 'infrastructure.js']),
        expect.any(Object)
      );
    });

    it('should NOT call process.exit when build succeeds', async () => {
      spawnSync.mockReturnValue({ status: 0 });

      await buildCommand({ stage: 'dev' });

      expect(processExitSpy).not.toHaveBeenCalled();
    });

    it('should log build start messages', async () => {
      await buildCommand({ stage: 'dev' });

      expect(consoleLogSpy).toHaveBeenCalledWith('Building the serverless application...');
      expect(consoleLogSpy).toHaveBeenCalledWith('📦 Packaging serverless application...');
    });

    it('should construct complete valid serverless command', async () => {
      await buildCommand({ stage: 'production', verbose: true });

      const [cmd, args, opts] = spawnSync.mock.calls[0];

      // Verify complete command structure
      expect(cmd).toBe('serverless');
      expect(args).toEqual([
        'package',
        '--config',
        'infrastructure.js',
        '--stage',
        'production',
        '--verbose'
      ]);

      // Verify all required options present
      expect(opts.cwd).toBeDefined();
      expect(opts.stdio).toBe('inherit');
      expect(opts.shell).toBe(true);
      expect(opts.env).toBeDefined();
      expect(opts.env.NODE_PATH).toBeDefined();
    });

    it('should build command without verbose when verbose=false', async () => {
      await buildCommand({ stage: 'dev', verbose: false });

      const [, args] = spawnSync.mock.calls[0];

      // Verify exact args without verbose
      expect(args).toEqual([
        'package',
        '--config',
        'infrastructure.js',
        '--stage',
        'dev'
      ]);
    });
  });

  describe('Error Handling', () => {
    it('should exit with code 1 when serverless fails', async () => {
      spawnSync.mockReturnValue({ status: 1 });

      await buildCommand({ stage: 'dev' });

      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should log error message when build fails', async () => {
      spawnSync.mockReturnValue({ status: 2 });

      await buildCommand({ stage: 'dev' });

      expect(consoleErrorSpy).toHaveBeenCalledWith('Serverless build failed with code 2');
    });

    it('should exit with code 1 for any non-zero status', async () => {
      spawnSync.mockReturnValue({ status: 127 });

      await buildCommand({ stage: 'dev' });

      expect(processExitSpy).toHaveBeenCalledWith(1);
      expect(consoleErrorSpy).toHaveBeenCalledWith('Serverless build failed with code 127');
    });
  });
});
