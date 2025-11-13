/**
 * Prisma Test Utilities
 *
 * Helper functions specific to testing Prisma-based repositories and database operations.
 *
 * Usage:
 *   const { setupPrismaTest, teardownPrismaTest } = require('@friggframework/test/helpers/prisma-test-utils');
 */

const { createMockPrismaClient } = require('../mocks/mock-prisma-client');

/**
 * Setup a Prisma test environment
 *
 * Provides a mock Prisma client and common test utilities
 *
 * @param {Object} options - Configuration options
 * @param {Object} options.clientOverrides - Overrides for the mock Prisma client
 * @returns {Object} Test environment with mock client
 */
function setupPrismaTest({ clientOverrides = {} } = {}) {
    const mockClient = createMockPrismaClient(clientOverrides);

    return {
        client: mockClient,
        resetMocks: () => {
            Object.values(mockClient).forEach((value) => {
                if (typeof value?.mockClear === 'function') {
                    value.mockClear();
                }
            });
        },
    };
}

/**
 * Teardown a Prisma test environment
 *
 * Cleans up mocks and resets state
 *
 * @param {Object} env - Test environment from setupPrismaTest
 */
function teardownPrismaTest(env) {
    if (env?.resetMocks) {
        env.resetMocks();
    }
}

/**
 * Create a mock query result
 *
 * Simulates a successful database query result
 *
 * @param {*} data - Data to return
 * @returns {Promise} Resolved promise with data
 */
function mockQueryResult(data) {
    return Promise.resolve(data);
}

/**
 * Create a mock query error
 *
 * Simulates a database query error
 *
 * @param {string} message - Error message
 * @param {string} code - Error code (e.g., 'P2002' for unique constraint)
 * @returns {Promise} Rejected promise with error
 */
function mockQueryError(message, code = 'P0000') {
    const error = new Error(message);
    error.code = code;
    return Promise.reject(error);
}

/**
 * Assert that a Prisma operation was called with expected arguments
 *
 * @param {Function} mockFn - Mocked Prisma function
 * @param {Object} expectedArgs - Expected arguments
 */
function assertPrismaCalledWith(mockFn, expectedArgs) {
    expect(mockFn).toHaveBeenCalledWith(
        expect.objectContaining(expectedArgs)
    );
}

/**
 * Create a mock for encrypted field operations
 *
 * Simulates field-level encryption behavior
 *
 * @param {Object} data - Original data
 * @param {Array<string>} encryptedFields - Fields that should be encrypted
 * @returns {Object} Data with encrypted fields
 */
function createEncryptedFieldMock(data, encryptedFields = []) {
    const encryptedData = { ...data };

    encryptedFields.forEach((field) => {
        if (data[field] !== undefined) {
            encryptedData[field] = `encrypted:${data[field]}`;
        }
    });

    return encryptedData;
}

/**
 * Create a mock for MongoDB ObjectId
 *
 * @param {string} id - Optional specific ID
 * @returns {string} Mock ObjectId
 */
function createMockObjectId(id) {
    if (id) {
        return id;
    }
    return '507f1f77bcf86cd799439011'; // Valid MongoDB ObjectId format
}

/**
 * Create a mock timestamp
 *
 * @param {Date} date - Optional specific date
 * @returns {Date} Timestamp
 */
function createMockTimestamp(date) {
    return date || new Date('2024-01-01T00:00:00.000Z');
}

/**
 * Create a standard mock entity
 *
 * Provides common fields found in most database entities
 *
 * @param {Object} overrides - Field overrides
 * @returns {Object} Mock entity
 */
function createMockEntity(overrides = {}) {
    return {
        id: createMockObjectId(),
        createdAt: createMockTimestamp(),
        updatedAt: createMockTimestamp(),
        ...overrides,
    };
}

/**
 * Setup mock for Prisma transaction
 *
 * Simplifies testing transactional operations
 *
 * @param {Object} mockClient - Mock Prisma client
 * @param {Function} implementation - Transaction implementation
 */
function setupTransactionMock(mockClient, implementation) {
    mockClient.$transaction = jest.fn(async (fn) => {
        if (typeof fn === 'function') {
            return await fn(mockClient);
        }
        // Handle array of operations
        return await Promise.all(fn);
    });

    if (implementation) {
        mockClient.$transaction.mockImplementation(implementation);
    }
}

/**
 * Verify that proper error handling exists for database operations
 *
 * @param {Function} operation - Async operation to test
 * @param {Object} mockClient - Mock Prisma client
 * @param {string} operationName - Name of the Prisma operation (e.g., 'findUnique')
 */
async function verifyErrorHandling(operation, mockClient, operationName) {
    const mockOperation = mockClient[operationName];
    mockOperation.mockRejectedValueOnce(new Error('Database error'));

    await expect(operation()).rejects.toThrow();
}

/**
 * Create a complete test suite setup for a repository
 *
 * Provides standard setup/teardown for repository tests
 *
 * @param {Object} options - Configuration options
 * @param {Function} options.RepositoryClass - Repository class to test
 * @param {Object} options.clientOverrides - Overrides for mock Prisma client
 * @returns {Object} Repository test environment
 */
function createRepositoryTestEnvironment({ RepositoryClass, clientOverrides = {} } = {}) {
    let mockClient;
    let repository;

    const setup = () => {
        const env = setupPrismaTest({ clientOverrides });
        mockClient = env.client;
        repository = new RepositoryClass({ prismaClient: mockClient });
        return { mockClient, repository, env };
    };

    const teardown = (env) => {
        teardownPrismaTest(env);
    };

    return { setup, teardown };
}

module.exports = {
    setupPrismaTest,
    teardownPrismaTest,
    mockQueryResult,
    mockQueryError,
    assertPrismaCalledWith,
    createEncryptedFieldMock,
    createMockObjectId,
    createMockTimestamp,
    createMockEntity,
    setupTransactionMock,
    verifyErrorHandling,
    createRepositoryTestEnvironment,
};
