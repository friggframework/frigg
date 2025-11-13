/**
 * Shared Test Mocks
 *
 * Centralized location for all test mocks following DDD/Hexagonal Architecture patterns.
 *
 * Usage:
 *   // Import specific utilities
 *   const { MockFactory } = require('@friggframework/test/mocks');
 *   const { createMockPrismaClient } = require('@friggframework/test/mocks');
 *
 *   // Or import everything
 *   const mocks = require('@friggframework/test/mocks');
 */

const { MockFactory } = require('./mock-factory');
const {
    createMockPrismaClient,
    createMockMongoDBClient,
    createMockPostgreSQLClient,
    createMockModel,
    createMockEncryptedPrismaClient,
} = require('./mock-prisma-client');

module.exports = {
    // Factory for creating standardized mocks
    MockFactory,

    // Prisma-specific mocks
    createMockPrismaClient,
    createMockMongoDBClient,
    createMockPostgreSQLClient,
    createMockModel,
    createMockEncryptedPrismaClient,
};
