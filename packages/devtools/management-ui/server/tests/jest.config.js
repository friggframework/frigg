export default {
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.js'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },
  transform: {},
  setupFilesAfterEnv: ['<rootDir>/setup.js'],
  testMatch: [
    '**/__tests__/**/*.js',
    '**/?(*.)+(spec|test).js'
  ],
  collectCoverageFrom: [
    '../**/*.js',
    '!../tests/**',
    '!../node_modules/**',
    '!../dist/**'
  ],
  coverageDirectory: './coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  verbose: true
}