const path = require('path');

module.exports = {
  displayName: 'Frigg CLI Tests',
  rootDir: __dirname,
  testMatch: [
    '<rootDir>/__tests__/**/*.test.js',
    '<rootDir>/__tests__/**/*.spec.js',
    '<rootDir>/**/start-command.test.js',
    '<rootDir>/**/__tests__/**/*.test.js'
  ],
  // Exclude utility files and config from being treated as tests
  testPathIgnorePatterns: [
    '/node_modules/',
    '/__tests__/utils/',
    '/__tests__/jest.config.js',
    '/test-setup.js'
  ],
  testEnvironment: 'node',
  collectCoverageFrom: [
    '**/*.js',
    '!**/*.test.js',
    '!**/*.spec.js',
    '!**/node_modules/**',
    '!**/__tests__/**',
    '!**/coverage/**'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'text-summary',
    'html',
    'lcov',
    'json'
  ],
  coverageThreshold: {
    global: {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85
    },
    './install-command/index.js': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    },
    './build-command/index.js': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    },
    './deploy-command/index.js': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    },
    './ui-command/index.js': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    },
    './generate-command/index.js': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    },
    './db-setup-command/index.js': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    },
    './utils/database-validator.js': {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85
    },
    './utils/prisma-runner.js': {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85
    },
    './utils/error-messages.js': {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85
    }
  },
  setupFilesAfterEnv: [
    path.join(__dirname, '__tests__', 'utils', 'test-setup.js')
  ],
  testTimeout: 10000,
  maxWorkers: '50%',
  verbose: true,
  collectCoverage: true,
  coveragePathIgnorePatterns: [
    '/node_modules/',
    '/__tests__/',
    '/coverage/',
    '.test.js',
    '.spec.js'
  ],
  moduleFileExtensions: [
    'js',
    'json',
    'node'
  ],
  transform: {},
  // testResultsProcessor: 'jest-sonar-reporter', // Optional dependency
  reporters: [
    'default'
    // jest-junit reporter removed - optional dependency
  ],
  watchman: false,
  forceExit: true,
  detectOpenHandles: true,
  errorOnDeprecated: true
};
