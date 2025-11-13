/**
 * Shared Jest Preset for Frigg Framework
 *
 * Provides standard configuration for all packages.
 * Individual packages can override these settings in their jest.config.js
 */
module.exports = {
    // Test environment
    testEnvironment: 'node',

    // Test runner with group support
    runner: 'groups',

    // Timeout for long-running tests
    testTimeout: 20_000,

    // Coverage settings
    collectCoverage: false, // Enable per-package or via CLI flag
    coverageReporters: ['text', 'lcov', 'html'],
    coveragePathIgnorePatterns: [
        '/node_modules/',
        '/dist/',
        '/__tests__/',
        '/test/',
        '.test.js',
        '.spec.js',
    ],

    // Default coverage thresholds (can be overridden per-package)
    coverageThreshold: {
        global: {
            statements: 15,
            branches: 10,
            functions: 15,
            lines: 15,
        },
    },

    // Test match patterns
    testMatch: ['**/__tests__/**/*.js', '**/*.test.js', '**/*.spec.js'],

    // Ignore patterns
    testPathIgnorePatterns: ['/node_modules/', '/dist/', '/build/'],

    // Module file extensions
    moduleFileExtensions: ['js', 'json', 'node'],

    // Verbose output
    verbose: false,

    // Clear mocks between tests
    clearMocks: true,
    resetMocks: true,
    restoreMocks: true,
};
