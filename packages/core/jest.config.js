/*
 * For a detailed explanation regarding each configuration property, visit:
 * https://jestjs.io/docs/configuration
 */

module.exports = {
    // preset: '@friggframework/test',
    coverageThreshold: {
        global: {
            statements: 13,
            branches: 0,
            functions: 1,
            lines: 13,
        },
    },
    // A path to a module which exports an async function that is triggered once before all test suites
    globalSetup: './jest-setup.js',

    // A path to a module which exports an async function that is triggered once after all test suites
    globalTeardown: './jest-teardown.js',

    setupFilesAfterEnv: ['./logs/jest-logger-setup.js'],

    // `*.db.test.js` suites talk to a real MongoDB replica set / PostgreSQL
    // and run separately via `npm run test:db` (jest.db.config.js).
    testPathIgnorePatterns: ['/node_modules/', '\\.db\\.test\\.js$'],
};
