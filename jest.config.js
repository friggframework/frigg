/**
 * Root Jest configuration for the Frigg monorepo
 * Runs tests across all packages using projects
 */

module.exports = {
    // Define projects for each testable package
    projects: [
        '<rootDir>/packages/core',
        '<rootDir>/packages/devtools',
        '<rootDir>/packages/test',
    ],

    // Coverage output directory
    coverageDirectory: '<rootDir>/coverage',

    // Collect coverage from all packages
    collectCoverageFrom: [
        'packages/*/!(node_modules)/**/*.js',
        '!**/*.test.js',
        '!**/*.spec.js',
        '!**/test/**',
        '!**/coverage/**',
        '!**/templates/**',
        '!jest.config.js',
        '!jest-*.js',
        '!**/index.js',
    ],

    // Coverage reporters for CI and local development
    coverageReporters: ['text', 'lcov', 'html'],

    // Max workers for parallel execution (limit in CI)
    maxWorkers: process.env.CI ? 2 : '50%',
};
