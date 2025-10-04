/**
 * Prisma Mock Utilities
 * Standardized mocking for Prisma Client in CLI tests
 * Following official Prisma testing patterns with jest-mock-extended
 */

/**
 * Creates a mock Prisma client with common operations
 * @returns {object} Mock Prisma client
 */
function createMockPrismaClient() {
    return {
        $connect: jest.fn().mockResolvedValue(undefined),
        $disconnect: jest.fn().mockResolvedValue(undefined),
        $queryRaw: jest.fn().mockResolvedValue([{ result: 1 }]),
        $executeRaw: jest.fn().mockResolvedValue(1),
        $transaction: jest.fn().mockImplementation(async (fn) => fn(createMockPrismaClient())),
        // Common model operations
        user: {
            findMany: jest.fn().mockResolvedValue([]),
            findUnique: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({}),
            update: jest.fn().mockResolvedValue({}),
            delete: jest.fn().mockResolvedValue({}),
        },
        credential: {
            findMany: jest.fn().mockResolvedValue([]),
            findUnique: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue({}),
            update: jest.fn().mockResolvedValue({}),
            delete: jest.fn().mockResolvedValue({}),
        },
    };
}

/**
 * Creates a mock for successful Prisma connection
 * @param {object} mockClient - Optional pre-configured mock client
 * @returns {jest.Mock} Mock connectPrisma function
 */
function createMockConnectPrisma(mockClient = null) {
    const client = mockClient || createMockPrismaClient();
    return jest.fn().mockResolvedValue(client);
}

/**
 * Creates a mock for successful Prisma disconnection
 * @returns {jest.Mock} Mock disconnectPrisma function
 */
function createMockDisconnectPrisma() {
    return jest.fn().mockResolvedValue(undefined);
}

/**
 * Creates a mock for Prisma connection that fails
 * @param {string} errorMessage - Error message to throw
 * @returns {jest.Mock} Mock connectPrisma that throws error
 */
function createMockConnectPrismaWithError(errorMessage = 'Connection failed') {
    return jest.fn().mockRejectedValue(new Error(errorMessage));
}

/**
 * Creates a mock for Prisma query that times out
 * @param {number} timeout - Timeout in milliseconds
 * @returns {jest.Mock} Mock that times out
 */
function createMockPrismaTimeout(timeout = 5000) {
    return jest.fn().mockImplementation(() =>
        new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Connection timeout')), timeout)
        )
    );
}

/**
 * Common Prisma error types for testing
 */
const PrismaErrors = {
    /**
     * Connection error (P1001)
     */
    CONNECTION_ERROR: {
        code: 'P1001',
        message: 'Can\'t reach database server',
        clientVersion: '5.0.0',
    },

    /**
     * Authentication error (P1002)
     */
    AUTH_ERROR: {
        code: 'P1002',
        message: 'The database server was reached but timed out',
        clientVersion: '5.0.0',
    },

    /**
     * Database not found error (P1003)
     */
    DATABASE_NOT_FOUND: {
        code: 'P1003',
        message: 'Database does not exist',
        clientVersion: '5.0.0',
    },

    /**
     * Connection timeout (P1008)
     */
    TIMEOUT_ERROR: {
        code: 'P1008',
        message: 'Operations timed out',
        clientVersion: '5.0.0',
    },

    /**
     * Invalid credentials
     */
    INVALID_CREDENTIALS: {
        code: 'P1000',
        message: 'Authentication failed against database server',
        clientVersion: '5.0.0',
    },
};

/**
 * Creates a Prisma error object
 * @param {string} errorType - Error type from PrismaErrors
 * @param {object} customFields - Additional custom fields
 * @returns {Error} Prisma-style error object
 */
function createPrismaError(errorType = 'CONNECTION_ERROR', customFields = {}) {
    const baseError = PrismaErrors[errorType] || PrismaErrors.CONNECTION_ERROR;
    const error = new Error(baseError.message);
    error.code = baseError.code;
    error.clientVersion = baseError.clientVersion;
    Object.assign(error, customFields);
    return error;
}

/**
 * Creates a mock for database validator functions
 * @param {object} overrides - Override specific mock behaviors
 * @returns {object} Mock database validator
 */
function createMockDatabaseValidator(overrides = {}) {
    return {
        validateDatabaseUrl: jest.fn().mockReturnValue({
            valid: true,
            url: 'mongodb://localhost:27017/test'
        }),
        getDatabaseType: jest.fn().mockReturnValue({
            dbType: 'mongodb'
        }),
        testDatabaseConnection: jest.fn().mockResolvedValue({
            connected: true
        }),
        checkPrismaClientGenerated: jest.fn().mockReturnValue({
            generated: true,
            path: '/mock/path'
        }),
        ...overrides,
    };
}

/**
 * Creates a mock for Prisma runner functions
 * @param {object} overrides - Override specific mock behaviors
 * @returns {object} Mock Prisma runner
 */
function createMockPrismaRunner(overrides = {}) {
    return {
        getPrismaSchemaPath: jest.fn().mockReturnValue('/mock/schema.prisma'),
        runPrismaGenerate: jest.fn().mockResolvedValue({ success: true }),
        checkDatabaseState: jest.fn().mockResolvedValue({ upToDate: true }),
        runPrismaMigrate: jest.fn().mockResolvedValue({ success: true }),
        runPrismaDbPush: jest.fn().mockResolvedValue({ success: true }),
        getMigrationCommand: jest.fn().mockReturnValue('dev'),
        ...overrides,
    };
}

module.exports = {
    createMockPrismaClient,
    createMockConnectPrisma,
    createMockDisconnectPrisma,
    createMockConnectPrismaWithError,
    createMockPrismaTimeout,
    createPrismaError,
    PrismaErrors,
    createMockDatabaseValidator,
    createMockPrismaRunner,
};
