/**
 * Global test setup for Frigg CLI tests
 * This file is executed before each test file
 */

// Store original environment
const originalEnv = process.env;
const originalConsole = { ...console };
const originalProcess = { ...process };

// Mock console to prevent noisy output during tests
global.console = {
  ...console,
  log: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

// Set up test environment variables
process.env = {
  ...originalEnv,
  NODE_ENV: 'test',
  HOME: '/mock/home',
  PATH: '/mock/path',
  CI: 'true'
};

// Global setup before each test
beforeEach(() => {
  // Clear all mocks
  jest.clearAllMocks();
  
  // Reset timers
  jest.clearAllTimers();
  
  // Reset modules
  jest.resetModules();
  
  // Restore original process methods
  process.exit = originalProcess.exit;
  process.cwd = originalProcess.cwd;
  
  // Mock process.exit to prevent actual exit
  process.exit = jest.fn();
  
  // Mock process.cwd to return predictable path
  process.cwd = jest.fn().mockReturnValue('/mock/cwd');
  
  // Reset console mocks
  global.console.log.mockClear();
  global.console.info.mockClear();
  global.console.warn.mockClear();
  global.console.error.mockClear();
  global.console.debug.mockClear();
});

// Global cleanup after each test
afterEach(() => {
  // Restore environment
  process.env = { ...originalEnv };
  
  // Restore process methods
  process.exit = originalProcess.exit;
  process.cwd = originalProcess.cwd;
  
  // Clear any remaining timers
  jest.clearAllTimers();
  
  // Unmock all modules
  jest.restoreAllMocks();
});

// Global teardown after all tests
afterAll(() => {
  // Restore original environment completely
  process.env = originalEnv;
  
  // Restore original console
  global.console = originalConsole;
  
  // Restore original process
  Object.assign(process, originalProcess);
});

// Custom matchers for CLI testing
expect.extend({
  toBeValidExitCode(received) {
    const validCodes = [0, 1, 2];
    const pass = validCodes.includes(received);
    
    if (pass) {
      return {
        message: () => `expected ${received} not to be a valid exit code`,
        pass: true
      };
    } else {
      return {
        message: () => `expected ${received} to be a valid exit code (0, 1, or 2)`,
        pass: false
      };
    }
  },
  
  toHaveLoggedError(received, expected) {
    const errorLogs = global.console.error.mock.calls;
    const pass = errorLogs.some(call => 
      call.some(arg => 
        typeof arg === 'string' && arg.includes(expected)
      )
    );
    
    if (pass) {
      return {
        message: () => `expected not to have logged error containing "${expected}"`,
        pass: true
      };
    } else {
      return {
        message: () => `expected to have logged error containing "${expected}"`,
        pass: false
      };
    }
  },
  
  toHaveLoggedInfo(received, expected) {
    const infoLogs = global.console.info.mock.calls;
    const pass = infoLogs.some(call => 
      call.some(arg => 
        typeof arg === 'string' && arg.includes(expected)
      )
    );
    
    if (pass) {
      return {
        message: () => `expected not to have logged info containing "${expected}"`,
        pass: true
      };
    } else {
      return {
        message: () => `expected to have logged info containing "${expected}"`,
        pass: false
      };
    }
  },
  
  toBeWithinTimeLimit(received, limit) {
    const pass = received <= limit;
    
    if (pass) {
      return {
        message: () => `expected ${received}ms not to be within ${limit}ms`,
        pass: true
      };
    } else {
      return {
        message: () => `expected ${received}ms to be within ${limit}ms`,
        pass: false
      };
    }
  }
});

// Helper functions available in all tests
global.TestHelpers = {
  /**
   * Create a temporary directory for tests
   */
  createTempDir() {
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    
    return fs.mkdtempSync(path.join(os.tmpdir(), 'frigg-cli-test-'));
  },
  
  /**
   * Clean up temporary directory
   */
  cleanupTempDir(dirPath) {
    const fs = require('fs');
    
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
    }
  },
  
  /**
   * Create a mock package.json file
   */
  createMockPackageJson(overrides = {}) {
    return JSON.stringify({
      name: 'test-package',
      version: '1.0.0',
      main: 'index.js',
      scripts: {
        test: 'jest',
        start: 'node index.js'
      },
      dependencies: {},
      devDependencies: {},
      ...overrides
    }, null, 2);
  },
  
  /**
   * Create a mock frigg.config.json file
   */
  createMockFriggConfig(overrides = {}) {
    return JSON.stringify({
      stage: 'dev',
      region: 'us-east-1',
      profile: 'default',
      backend: {
        runtime: 'nodejs18.x',
        timeout: 30,
        memory: 128
      },
      ...overrides
    }, null, 2);
  },
  
  /**
   * Wait for a specific amount of time
   */
  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },
  
  /**
   * Generate a random string for test data
   */
  randomString(length = 10) {
    return Math.random().toString(36).substring(2, length + 2);
  },
  
  /**
   * Simulate file system structure
   */
  mockFileSystem(structure) {
    const fs = require('fs');
    
    const originalExistsSync = fs.existsSync;
    const originalReadFileSync = fs.readFileSync;
    const originalWriteFileSync = fs.writeFileSync;
    
    fs.existsSync = jest.fn((path) => {
      return structure.hasOwnProperty(path);
    });
    
    fs.readFileSync = jest.fn((path) => {
      if (structure.hasOwnProperty(path)) {
        return structure[path];
      }
      throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    });
    
    fs.writeFileSync = jest.fn((path, data) => {
      structure[path] = data;
    });
    
    return {
      restore() {
        fs.existsSync = originalExistsSync;
        fs.readFileSync = originalReadFileSync;
        fs.writeFileSync = originalWriteFileSync;
      }
    };
  }
};

// Global timeout for all tests
jest.setTimeout(30000);

// Suppress specific warnings during tests
const originalWarn = console.warn;
console.warn = (...args) => {
  // Suppress specific warnings that are expected during testing
  const message = args.join(' ');
  if (message.includes('ExperimentalWarning') || 
      message.includes('DeprecationWarning')) {
    return;
  }
  originalWarn.apply(console, args);
};