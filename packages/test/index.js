const { TestMongo } = require('./mongodb');
const {
    overrideEnvironment,
    restoreEnvironment,
} = require('./override-environment');
const globalTeardown = require('./jest-global-teardown');
const globalSetup = require('./jest-global-setup');
const Authenticator = require('./Authenticator');

// Router test utilities are loaded lazily to avoid jest.fn() errors during
// global setup (when Jest globals aren't available yet)
let _routerTestUtils = null;

/**
 * Lazily load router test utilities (only when called from test context)
 * @returns {Object} Router test utilities
 */
const getRouterTestUtils = () => {
    if (!_routerTestUtils) {
        _routerTestUtils = require('./router-test-utils');
    }
    return _routerTestUtils;
};

module.exports = {
    TestMongo,
    overrideEnvironment,
    restoreEnvironment,
    globalTeardown,
    globalSetup,
    Authenticator,
    // Router test utilities - use getRouterTestUtils() for lazy loading
    getRouterTestUtils,
    // Direct import path is available: require('@friggframework/test/router-test-utils')
};
