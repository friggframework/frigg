/**
 * MockFactory - Factory for creating standardized mocks
 * Provides consistent mock implementations across all CLI tests
 */
class MockFactory {
  /**
   * Create a file system mock
   * @returns {object} - Mock fs implementation
   */
  static createFileSystem() {
    return {
      existsSync: jest.fn().mockReturnValue(true),
      readFileSync: jest.fn().mockReturnValue('{}'),
      writeFileSync: jest.fn(),
      mkdirSync: jest.fn(),
      readdirSync: jest.fn().mockReturnValue([]),
      statSync: jest.fn().mockReturnValue({
        isDirectory: () => false,
        isFile: () => true
      }),
      copyFileSync: jest.fn(),
      unlinkSync: jest.fn(),
      rmdirSync: jest.fn(),
      constants: {
        F_OK: 0,
        R_OK: 4,
        W_OK: 2,
        X_OK: 1
      }
    };
  }

  /**
   * Create a logger mock
   * @returns {object} - Mock logger implementation
   */
  static createLogger() {
    return {
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      logInfo: jest.fn(),
      logError: jest.fn(),
      logDebug: jest.fn(),
      logWarn: jest.fn()
    };
  }

  /**
   * Create a package manager mock
   * @returns {object} - Mock package manager implementation
   */
  static createPackageManager() {
    return {
      install: jest.fn().mockResolvedValue({ success: true }),
      list: jest.fn().mockResolvedValue([]),
      exists: jest.fn().mockResolvedValue(true),
      getInfo: jest.fn().mockResolvedValue({
        name: 'test-package',
        version: '1.0.0'
      }),
      search: jest.fn().mockResolvedValue([])
    };
  }

  /**
   * Create a child process mock
   * @returns {object} - Mock child_process implementation
   */
  static createChildProcess() {
    return {
      execSync: jest.fn().mockReturnValue(''),
      exec: jest.fn(),
      spawn: jest.fn().mockReturnValue({
        stdout: { on: jest.fn() },
        stderr: { on: jest.fn() },
        on: jest.fn((event, callback) => {
          if (event === 'close') {
            callback(0);
          }
        })
      }),
      fork: jest.fn()
    };
  }

  /**
   * Create a git mock
   * @returns {object} - Mock git implementation
   */
  static createGit() {
    return {
      init: jest.fn(),
      add: jest.fn(),
      commit: jest.fn(),
      status: jest.fn().mockReturnValue({
        clean: true,
        files: []
      }),
      branch: jest.fn().mockReturnValue('main'),
      remote: jest.fn().mockReturnValue('origin'),
      isRepo: jest.fn().mockReturnValue(true)
    };
  }

  /**
   * Create a config loader mock
   * @returns {object} - Mock config loader implementation
   */
  static createConfigLoader() {
    return {
      load: jest.fn().mockReturnValue({
        stage: 'dev',
        region: 'us-east-1',
        profile: 'default'
      }),
      validate: jest.fn().mockReturnValue(true),
      save: jest.fn(),
      merge: jest.fn()
    };
  }

  /**
   * Create an app resolver mock
   * @returns {object} - Mock app resolver implementation
   */
  static createAppResolver() {
    return {
      resolveAppPath: jest.fn().mockReturnValue('/mock/app/path'),
      findNearestBackendPackageJson: jest.fn().mockReturnValue('/mock/backend/package.json'),
      validateBackendPath: jest.fn().mockReturnValue(true),
      getProjectRoot: jest.fn().mockReturnValue('/mock/project'),
      findConfigFile: jest.fn().mockReturnValue('/mock/config.json')
    };
  }

  /**
   * Create a network mock
   * @returns {object} - Mock network implementation
   */
  static createNetwork() {
    return {
      get: jest.fn().mockResolvedValue({
        status: 200,
        data: {}
      }),
      post: jest.fn().mockResolvedValue({
        status: 200,
        data: {}
      }),
      put: jest.fn().mockResolvedValue({
        status: 200,
        data: {}
      }),
      delete: jest.fn().mockResolvedValue({
        status: 200,
        data: {}
      })
    };
  }

  /**
   * Create a comprehensive mock environment
   * @returns {object} - Complete mock environment
   */
  static createMockEnvironment() {
    return {
      fs: this.createFileSystem(),
      logger: this.createLogger(),
      packageManager: this.createPackageManager(),
      childProcess: this.createChildProcess(),
      git: this.createGit(),
      config: this.createConfigLoader(),
      appResolver: this.createAppResolver(),
      network: this.createNetwork()
    };
  }

  /**
   * Create a mock for process.env
   * @param {object} customEnv - Custom environment variables
   * @returns {object} - Mock environment
   */
  static createProcessEnv(customEnv = {}) {
    return {
      NODE_ENV: 'test',
      HOME: '/mock/home',
      PATH: '/mock/path',
      ...customEnv
    };
  }

  /**
   * Create success response mock
   * @param {any} data - Response data
   * @returns {object} - Success response
   */
  static createSuccessResponse(data = {}) {
    return {
      success: true,
      data,
      message: 'Operation completed successfully'
    };
  }

  /**
   * Create error response mock
   * @param {string} message - Error message
   * @param {string} code - Error code
   * @returns {object} - Error response
   */
  static createErrorResponse(message = 'An error occurred', code = 'GENERIC_ERROR') {
    return {
      success: false,
      error: {
        message,
        code,
        stack: 'Mock stack trace'
      }
    };
  }

  /**
   * Create package.json mock
   * @param {object} overrides - Custom package.json properties
   * @returns {object} - Mock package.json
   */
  static createPackageJson(overrides = {}) {
    return {
      name: 'test-package',
      version: '1.0.0',
      description: 'Test package',
      main: 'index.js',
      scripts: {
        test: 'jest',
        start: 'node index.js'
      },
      dependencies: {},
      devDependencies: {},
      ...overrides
    };
  }

  /**
   * Create frigg config mock
   * @param {object} overrides - Custom config properties
   * @returns {object} - Mock frigg config
   */
  static createFriggConfig(overrides = {}) {
    return {
      stage: 'dev',
      region: 'us-east-1',
      profile: 'default',
      backend: {
        runtime: 'nodejs18.x',
        timeout: 30,
        memory: 128
      },
      frontend: {
        framework: 'react',
        buildCommand: 'npm run build',
        outputDir: 'dist'
      },
      ...overrides
    };
  }
}

module.exports = { MockFactory };