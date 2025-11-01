/**
 * Test suite for ui command
 *
 * Tests the management UI startup functionality including:
 * - Repository detection and discovery
 * - Development mode (backend + frontend servers)
 * - Production mode (integrated server)
 * - Browser opening
 * - Error handling (port conflicts, missing repos)
 * - Process management
 */

// Mock dependencies BEFORE requiring modules
jest.mock('open', () => jest.fn());
jest.mock('../../../utils/process-manager');
jest.mock('../../../utils/repo-detection', () => ({
  getCurrentRepositoryInfo: jest.fn(),
  discoverFriggRepositories: jest.fn(),
  promptRepositorySelection: jest.fn(),
  formatRepositoryInfo: jest.fn()
}));
jest.mock('fs', () => ({
  existsSync: jest.fn()
}));

// Require after mocks
const open = require('open');
const ProcessManager = require('../../../utils/process-manager');
const {
  getCurrentRepositoryInfo,
  discoverFriggRepositories,
  formatRepositoryInfo
} = require('../../../utils/repo-detection');
const { uiCommand } = require('../../../ui-command');

describe('CLI Command: ui', () => {
  let consoleLogSpy;
  let consoleErrorSpy;
  let processExitSpy;
  let mockProcessManager;
  let originalEnv;
  let stdinResumeSpy;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock console methods
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

    // Mock process.exit to prevent actual exit
    processExitSpy = jest.spyOn(process, 'exit').mockImplementation();

    // Mock process.stdin.resume
    stdinResumeSpy = jest.spyOn(process.stdin, 'resume').mockImplementation();

    // Store and reset NODE_ENV
    originalEnv = process.env.NODE_ENV;
    delete process.env.NODE_ENV;

    // Setup ProcessManager mock
    mockProcessManager = {
      spawnProcess: jest.fn(),
      printStatus: jest.fn()
    };
    ProcessManager.mockImplementation(() => mockProcessManager);

    // Setup default repo-detection mocks
    getCurrentRepositoryInfo.mockResolvedValue({
      path: '/mock/frigg-repo',
      name: 'test-repo',
      currentSubPath: null
    });
    formatRepositoryInfo.mockReturnValue('test-repo');
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    processExitSpy.mockRestore();
    stdinResumeSpy.mockRestore();
    process.env.NODE_ENV = originalEnv;
  });

  describe('Repository Detection', () => {
    it('should use specified repo path when provided', async () => {
      await uiCommand({ repo: '/custom/repo', port: 3001, open: false });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Using specified repository')
      );
    });

    it('should detect current Frigg repository', async () => {
      await uiCommand({ port: 3001, open: false });

      expect(getCurrentRepositoryInfo).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Found Frigg repository')
      );
    });

    it('should show subdirectory when in subpath', async () => {
      getCurrentRepositoryInfo.mockResolvedValue({
        path: '/mock/frigg-repo',
        name: 'test-repo',
        currentSubPath: 'packages/backend'
      });

      await uiCommand({ port: 3001, open: false });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Currently in subdirectory: packages/backend')
      );
    });

    it('should discover repos when not in Frigg repo', async () => {
      getCurrentRepositoryInfo.mockResolvedValue(null);
      discoverFriggRepositories.mockResolvedValue([
        { path: '/repos/frigg-1', name: 'frigg-1' },
        { path: '/repos/frigg-2', name: 'frigg-2' }
      ]);

      await uiCommand({ port: 3001, open: false });

      expect(discoverFriggRepositories).toHaveBeenCalled();
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Found 2 Frigg repositories')
      );
    });

    it('should exit when no repos found', async () => {
      getCurrentRepositoryInfo.mockResolvedValue(null);
      discoverFriggRepositories.mockResolvedValue([]);

      await uiCommand({ port: 3001, open: false });

      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('No Frigg repositories found')
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('Development Mode', () => {
    it('should spawn backend and frontend in dev mode', async () => {
      await uiCommand({ port: 3001, open: false, dev: true });

      expect(mockProcessManager.spawnProcess).toHaveBeenCalledTimes(2);
      expect(mockProcessManager.spawnProcess).toHaveBeenCalledWith(
        'backend',
        'npm',
        ['run', 'server'],
        expect.objectContaining({
          cwd: expect.stringContaining('management-ui'),
          env: expect.objectContaining({
            PORT: 3001,
            VITE_API_URL: 'http://localhost:3001'
          })
        })
      );
      expect(mockProcessManager.spawnProcess).toHaveBeenCalledWith(
        'frontend',
        'npm',
        ['run', 'dev'],
        expect.any(Object)
      );
    });

    it('should use default port 3001', async () => {
      await uiCommand({ open: false, dev: true });

      expect(mockProcessManager.spawnProcess).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(Array),
        expect.objectContaining({
          env: expect.objectContaining({ PORT: 3001 })
        })
      );
    });

    it('should use custom port when specified', async () => {
      await uiCommand({ port: 4000, open: false, dev: true });

      expect(mockProcessManager.spawnProcess).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(Array),
        expect.objectContaining({
          env: expect.objectContaining({
            PORT: 4000,
            VITE_API_URL: 'http://localhost:4000'
          })
        })
      );
    });

    it('should print status with correct URLs', async () => {
      await uiCommand({ port: 3001, open: false, dev: true });

      // Wait for startup delay (testing async behavior, not mocks)
      await new Promise(resolve => setTimeout(resolve, 2100));

      // Verify printStatus called with exact URLs
      expect(mockProcessManager.printStatus).toHaveBeenCalledWith(
        'http://localhost:5173',
        'http://localhost:3001',
        'test-repo'
      );
    });

    it('should open browser when open=true', async () => {
      await uiCommand({ port: 3001, open: true, dev: true });

      // Wait for startup + browser delay (testing async behavior, not mocks)
      await new Promise(resolve => setTimeout(resolve, 3100));

      // Verify browser opened with correct URL
      expect(open).toHaveBeenCalledWith('http://localhost:5173');
    });

    it('should NOT open browser when open=false', async () => {
      await uiCommand({ port: 3001, open: false, dev: true });

      // Wait for startup delay (testing async behavior, not mocks)
      await new Promise(resolve => setTimeout(resolve, 3100));

      // Verify browser was not opened
      expect(open).not.toHaveBeenCalled();
    });

    it('should set PROJECT_ROOT environment variable', async () => {
      getCurrentRepositoryInfo.mockResolvedValue({
        path: '/custom/repo/path',
        name: 'custom-repo',
        currentSubPath: null
      });

      await uiCommand({ port: 3001, open: false, dev: true });

      expect(mockProcessManager.spawnProcess).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        expect.any(Array),
        expect.objectContaining({
          env: expect.objectContaining({
            PROJECT_ROOT: '/custom/repo/path'
          })
        })
      );
    });

    it('should set REPOSITORY_INFO as JSON string with correct structure', async () => {
      await uiCommand({ port: 3001, open: false, dev: true });

      const call = mockProcessManager.spawnProcess.mock.calls[0];
      const env = call[3].env;

      // Verify REPOSITORY_INFO is valid JSON with correct structure
      expect(env.REPOSITORY_INFO).toBeDefined();
      const parsedInfo = JSON.parse(env.REPOSITORY_INFO);

      // Verify actual data matches mock
      expect(parsedInfo).toEqual({
        path: '/mock/frigg-repo',
        name: 'test-repo',
        currentSubPath: null
      });
    });

    it('should set AVAILABLE_REPOSITORIES with actual repository data', async () => {
      getCurrentRepositoryInfo.mockResolvedValue(null);
      discoverFriggRepositories.mockResolvedValue([
        { path: '/repos/frigg-1', name: 'frigg-1' }
      ]);

      await uiCommand({ port: 3001, open: false, dev: true });

      const call = mockProcessManager.spawnProcess.mock.calls[0];
      const env = call[3].env;

      // Verify AVAILABLE_REPOSITORIES is valid JSON with correct structure
      expect(env.AVAILABLE_REPOSITORIES).toBeDefined();
      const parsed = JSON.parse(env.AVAILABLE_REPOSITORIES);

      // Verify actual data matches mock
      expect(parsed).toEqual([
        { path: '/repos/frigg-1', name: 'frigg-1' }
      ]);
    });
  });

  describe('Error Handling', () => {
    it('should handle EADDRINUSE error', async () => {
      mockProcessManager.spawnProcess.mockImplementation(() => {
        const error = new Error('Port in use');
        error.code = 'EADDRINUSE';
        throw error;
      });

      await uiCommand({ port: 3001, open: false, dev: true });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to start Management UI'),
        expect.any(String)
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Port 3001 is already in use')
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });

    it('should handle generic errors', async () => {
      mockProcessManager.spawnProcess.mockImplementation(() => {
        throw new Error('Generic startup error');
      });

      await uiCommand({ port: 3001, open: false, dev: true });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to start Management UI'),
        'Generic startup error'
      );
      expect(processExitSpy).toHaveBeenCalledWith(1);
    });
  });

  describe('Process Management', () => {
    it('should create ProcessManager instance', async () => {
      await uiCommand({ port: 3001, open: false, dev: true });

      expect(ProcessManager).toHaveBeenCalled();
    });

    it('should keep process running with stdin.resume', async () => {
      await uiCommand({ port: 3001, open: false, dev: true });

      // Wait for startup delay (testing async behavior, not mocks)
      await new Promise(resolve => setTimeout(resolve, 2100));

      // Verify stdin.resume called to keep process alive
      expect(stdinResumeSpy).toHaveBeenCalled();
    });
  });
});
