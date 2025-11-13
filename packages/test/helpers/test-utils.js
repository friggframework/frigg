/**
 * Test Utilities
 *
 * Helper functions for test setup, environment management, and common test operations.
 *
 * Usage:
 *   const { setTestEnvironmentVariables, cleanupTestEnvironment } = require('@friggframework/test/helpers/test-utils');
 */

/**
 * Set test environment variables
 *
 * Preserves original values for cleanup
 *
 * @param {Object} envVars - Environment variables to set
 * @returns {Object} Original environment variable values
 */
function setTestEnvironmentVariables(envVars = {}) {
    const originalEnv = {};

    Object.keys(envVars).forEach((key) => {
        originalEnv[key] = process.env[key];
        process.env[key] = envVars[key];
    });

    return originalEnv;
}

/**
 * Restore environment variables to original values
 *
 * @param {Object} originalEnv - Original environment variable values
 */
function restoreEnvironmentVariables(originalEnv = {}) {
    Object.keys(originalEnv).forEach((key) => {
        if (originalEnv[key] === undefined) {
            delete process.env[key];
        } else {
            process.env[key] = originalEnv[key];
        }
    });
}

/**
 * Cleanup test environment
 *
 * Removes common test environment variables
 */
function cleanupTestEnvironment() {
    const testEnvVars = [
        'DATABASE_URL',
        'MONGO_URI',
        'STAGE',
        'KMS_KEY_ARN',
        'AES_KEY_ID',
        'AES_KEY',
        'TEST_TYPE',
        'REQUIRE_MONGODB',
    ];

    testEnvVars.forEach((key) => {
        delete process.env[key];
    });
}

/**
 * Create a delay promise
 *
 * @param {number} ms - Milliseconds to delay
 * @returns {Promise} Promise that resolves after delay
 */
function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for a condition to be true
 *
 * @param {Function} condition - Function that returns boolean
 * @param {Object} options - Configuration options
 * @param {number} options.timeout - Maximum time to wait in ms (default: 5000)
 * @param {number} options.interval - Check interval in ms (default: 100)
 * @returns {Promise<boolean>} True if condition met, false if timeout
 */
async function waitForCondition(condition, { timeout = 5000, interval = 100 } = {}) {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
        if (await condition()) {
            return true;
        }
        await delay(interval);
    }

    return false;
}

/**
 * Create a spy that tracks calls with detailed information
 *
 * Useful for debugging test failures
 *
 * @param {string} name - Name of the spy for logging
 * @returns {Function} Spy function with call tracking
 */
function createTrackedSpy(name) {
    const calls = [];

    const spy = jest.fn((...args) => {
        calls.push({
            timestamp: Date.now(),
            args,
        });
    });

    spy.getCalls = () => calls;
    spy.getCallCount = () => calls.length;
    spy.getCallArgs = (index) => (calls[index] ? calls[index].args : undefined);
    spy.name = name;

    return spy;
}

/**
 * Assert that a function throws an error with specific message
 *
 * More flexible than expect().toThrow() for async testing
 *
 * @param {Function} fn - Function to test
 * @param {string|RegExp} errorMessage - Expected error message
 */
async function assertThrows(fn, errorMessage) {
    let error = null;

    try {
        await fn();
    } catch (err) {
        error = err;
    }

    if (!error) {
        throw new Error('Expected function to throw an error, but it did not');
    }

    if (typeof errorMessage === 'string') {
        if (!error.message.includes(errorMessage)) {
            throw new Error(
                `Expected error message to include "${errorMessage}", but got "${error.message}"`
            );
        }
    } else if (errorMessage instanceof RegExp) {
        if (!errorMessage.test(error.message)) {
            throw new Error(
                `Expected error message to match ${errorMessage}, but got "${error.message}"`
            );
        }
    }

    return error;
}

/**
 * Create a mock timer environment
 *
 * Simplifies testing time-dependent code
 *
 * @returns {Object} Timer utilities
 */
function createMockTimer() {
    jest.useFakeTimers();

    return {
        advanceTime: (ms) => jest.advanceTimersByTime(ms),
        runAllTimers: () => jest.runAllTimers(),
        runPendingTimers: () => jest.runOnlyPendingTimers(),
        cleanup: () => jest.useRealTimers(),
    };
}

/**
 * Generate a random test ID
 *
 * Useful for creating unique identifiers in tests
 *
 * @param {string} prefix - Optional prefix for the ID
 * @returns {string} Random test ID
 */
function generateTestId(prefix = 'test') {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create a test context object
 *
 * Provides a standard structure for organizing test data and mocks
 *
 * @returns {Object} Test context with common utilities
 */
function createTestContext() {
    const context = {
        // Test data storage
        data: {},

        // Mocks storage
        mocks: {},

        // Cleanup functions
        cleanups: [],

        // Add a cleanup function to be run after test
        addCleanup(fn) {
            this.cleanups.push(fn);
        },

        // Run all cleanup functions
        async cleanup() {
            for (const fn of this.cleanups.reverse()) {
                await fn();
            }
            this.cleanups = [];
        },

        // Reset the context
        reset() {
            this.data = {};
            this.mocks = {};
            this.cleanups = [];
        },
    };

    return context;
}

module.exports = {
    setTestEnvironmentVariables,
    restoreEnvironmentVariables,
    cleanupTestEnvironment,
    delay,
    waitForCondition,
    createTrackedSpy,
    assertThrows,
    createMockTimer,
    generateTestId,
    createTestContext,
};
