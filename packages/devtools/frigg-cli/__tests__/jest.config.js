module.exports = {
  displayName: 'Frigg CLI Tests',
  testMatch: [
    '<rootDir>/__tests__/**/*.test.js',
    '<rootDir>/__tests__/**/*.spec.js'
  ],
  testEnvironment: 'node',
  collectCoverageFrom: [
    '../**/*.js',
    '!../**/*.test.js',
    '!../**/*.spec.js',
    '!../node_modules/**',
    '!../__tests__/**',
    '!../coverage/**'
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
    '../install-command/index.js': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    },
    '../build-command/index.js': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    },
    '../deploy-command/index.js': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    },
    '../ui-command/index.js': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    },
    '../generate-command/index.js': {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    }
  },
  setupFilesAfterEnv: [
    '<rootDir>/utils/test-setup.js'
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
  testResultsProcessor: 'jest-sonar-reporter',
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: 'coverage',
        outputName: 'junit.xml',
        ancestorSeparator: ' › ',
        uniqueOutputName: 'false',
        suiteNameTemplate: '{filepath}',
        classNameTemplate: '{classname}',
        titleTemplate: '{title}'
      }
    ]
  ],
  watchman: false,
  forceExit: true,
  detectOpenHandles: true,
  errorOnDeprecated: true
};