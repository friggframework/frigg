/*
 * For a detailed explanation regarding each configuration property, visit:
 * https://jestjs.io/docs/configuration
 */

module.exports = {
    preset: '@friggframework/test',

    // Override coverage thresholds - start low, increase gradually
    coverageThreshold: {
        global: {
            statements: 20,
            branches: 15,
            functions: 20,
            lines: 20,
        },
    },

    // A path to a module which exports an async function that is triggered once before all test suites
    globalSetup: './jest-setup.js',

    // A path to a module which exports an async function that is triggered once after all test suites
    globalTeardown: './jest-teardown.js',
};
