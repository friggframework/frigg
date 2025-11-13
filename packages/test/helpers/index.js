/**
 * Shared Test Helpers
 *
 * Helper utilities for test setup, environment management, and common operations.
 *
 * Usage:
 *   // Import specific utilities
 *   const { setTestEnvironmentVariables } = require('@friggframework/test/helpers');
 *   const { setupPrismaTest } = require('@friggframework/test/helpers');
 *
 *   // Or import everything
 *   const helpers = require('@friggframework/test/helpers');
 */

const testUtils = require('./test-utils');
const prismaTestUtils = require('./prisma-test-utils');

module.exports = {
    // General test utilities
    ...testUtils,

    // Prisma-specific utilities
    ...prismaTestUtils,
};
