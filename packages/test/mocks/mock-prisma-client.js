/**
 * Mock Prisma Client Factory
 *
 * Provides reusable mock Prisma clients for unit tests.
 * These mocks follow the patterns established in the test suite.
 *
 * Usage:
 *   const { createMockPrismaClient } = require('@friggframework/test/mocks/mock-prisma-client');
 *
 *   const mockClient = createMockPrismaClient({
 *     entity: {
 *       findUnique: jest.fn().mockResolvedValue({ id: '123' }),
 *     },
 *   });
 */

/**
 * Create a basic mock Prisma client with common operations
 *
 * @param {Object} overrides - Optional overrides for specific models/operations
 * @returns {Object} Mock Prisma client
 */
function createMockPrismaClient(overrides = {}) {
    const baseClient = {
        // Raw query operations
        $queryRaw: jest.fn(),
        $queryRawUnsafe: jest.fn(),
        $executeRaw: jest.fn(),
        $executeRawUnsafe: jest.fn(),

        // Transaction operations
        $transaction: jest.fn((fn) => fn(baseClient)),

        // Connection operations
        $connect: jest.fn().mockResolvedValue(undefined),
        $disconnect: jest.fn().mockResolvedValue(undefined),

        // Extension operations
        $extends: jest.fn().mockReturnThis(),
    };

    // Merge in any overrides
    return {
        ...baseClient,
        ...overrides,
    };
}

/**
 * Create a mock Prisma client for MongoDB operations
 *
 * Includes common MongoDB-specific operations
 */
function createMockMongoDBClient(overrides = {}) {
    return createMockPrismaClient({
        // MongoDB models
        credential: createMockModel(),
        entity: createMockModel(),
        integrationMapping: createMockModel(),
        user: createMockModel(),
        token: createMockModel(),
        ...overrides,
    });
}

/**
 * Create a mock Prisma client for PostgreSQL operations
 *
 * Includes common PostgreSQL-specific operations
 */
function createMockPostgreSQLClient(overrides = {}) {
    return createMockPrismaClient({
        // PostgreSQL raw query typically used for health checks
        $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
        ...overrides,
    });
}

/**
 * Create a mock model with standard CRUD operations
 *
 * @param {Object} overrides - Optional overrides for specific operations
 * @returns {Object} Mock model
 */
function createMockModel(overrides = {}) {
    return {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        createMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        upsert: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
        count: jest.fn(),
        aggregate: jest.fn(),
        groupBy: jest.fn(),
        ...overrides,
    };
}

/**
 * Create a mock for field-level encryption extension
 *
 * Returns a client that supports the encryption extension pattern
 */
function createMockEncryptedPrismaClient(overrides = {}) {
    const baseClient = createMockPrismaClient(overrides);

    // Mock the extension method to return a client with encryption
    baseClient.$extends = jest.fn().mockReturnValue({
        ...baseClient,
        _encrypted: true,
    });

    return baseClient;
}

module.exports = {
    createMockPrismaClient,
    createMockMongoDBClient,
    createMockPostgreSQLClient,
    createMockModel,
    createMockEncryptedPrismaClient,
};
