const { TestMongo } = require('./mongodb');
const {
    overrideEnvironment,
    restoreEnvironment,
} = require('./override-environment');
const globalTeardown = require('./jest-global-teardown');
const globalSetup = require('./jest-global-setup');
const Authenticator = require('./Authenticator');

// Export new shared test utilities
const mocks = require('./mocks');
const helpers = require('./helpers');

module.exports = {
    // Legacy exports
    TestMongo,
    overrideEnvironment,
    restoreEnvironment,
    globalTeardown,
    globalSetup,
    Authenticator,

    // New shared test utilities (DDD/Hexagonal Architecture patterns)
    ...mocks,
    ...helpers,

    // Also export as namespaced objects for clarity
    mocks,
    helpers,
};
