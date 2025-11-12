module.exports = {
    // Test environment
    testEnvironment: 'node',

    // Test runner with groups support
    runner: 'jest-runner-groups',

    // Coverage configuration
    collectCoverage: false, // Only on CI or with explicit --coverage flag
    collectCoverageFrom: [
        '**/*.js',
        '!**/*.test.js',
        '!**/*.spec.js',
        '!**/node_modules/**',
        '!**/test/**',
        '!**/coverage/**',
        '!**/templates/**',
        '!jest.config.js',
        '!jest-*.js',
        '!**/index.js', // Often just exports
    ],
    coverageReporters: ['text', 'lcov', 'html'],
    coverageThreshold: {
        global: {
            statements: 20, // Realistic starting point, increase gradually
            branches: 15,
            functions: 20,
            lines: 20,
        },
    },

    // Timeouts
    testTimeout: 20000, // 20 seconds default

    // File patterns
    testMatch: [
        '**/__tests__/**/*.js',
        '**/?(*.)+(spec|test).js',
    ],

    // Setup/teardown
    globalSetup: '@friggframework/test/jest-global-setup.js',
    globalTeardown: '@friggframework/test/jest-global-teardown.js',

    // Clear mocks between tests for better isolation
    clearMocks: true,
    resetMocks: true,
    restoreMocks: true,
};
