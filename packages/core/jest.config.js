/*
 * For a detailed explanation regarding each configuration property, visit:
 * https://jestjs.io/docs/configuration
 */

module.exports = {
    // Use shared test preset
    preset: '@friggframework/test',

    // Coverage thresholds - set realistically for current codebase state
    // Target: gradually increase to 80% over time
    coverageThreshold: {
        global: {
            statements: 15,
            branches: 10,
            functions: 15,
            lines: 15,
        },
    },

    // Global setup/teardown for MongoDB memory server (conditional)
    globalSetup: './jest-setup.js',
    globalTeardown: './jest-teardown.js',

    // Test environment
    testEnvironment: 'node',

    // Module paths
    testMatch: ['**/*.test.js'],

    // Ignore patterns
    testPathIgnorePatterns: [
        '/node_modules/',
        '/dist/',
        // Exclude JWT stub test - feature not implemented yet
        'get-user-from-adopter-jwt.test.js',
    ],
};
