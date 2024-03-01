/*
 * For a detailed explanation regarding each configuration property, visit:
 * https://jestjs.io/docs/configuration
 */

module.exports = {
    // preset: '@friggframework/test-environment',
    coverageThreshold: {
        global: {
            statements: 85,
            branches: 85,
            functions: 85,
            lines: 85,
        },
    },
    // A path to a module which exports an async function that is triggered once before all test suites
    globalSetup: './jest-setup.js',

    // A path to a module which exports an async function that is triggered once after all test suites
    globalTeardown: './jest-teardown.js',
};
