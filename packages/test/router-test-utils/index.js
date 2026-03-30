/**
 * @file Router Test Utilities
 * @description Shared test utilities for Express router testing in Frigg Framework
 *
 * These utilities reduce boilerplate and ensure consistency across router tests.
 * Use these helpers to:
 * - Create mock repositories with standard interfaces
 * - Set up Express apps with authentication middleware
 * - Handle Boom errors properly in test environments
 * - Generate consistent test data
 *
 * @example
 * const { createTestApp, createMockRepositories, mockData } = require('@friggframework/test/router-test-utils');
 *
 * describe('My Router', () => {
 *     let app, mocks;
 *
 *     beforeEach(() => {
 *         mocks = createMockRepositories();
 *         app = createTestApp({ router: myRouter, mocks });
 *     });
 * });
 */

const express = require('express');
const Boom = require('@hapi/boom');

// ============================================================================
// Mock Data Generators
// ============================================================================

/**
 * Helper to safely get jest.fn() - returns a real mock in test context, noop otherwise
 * @returns {Function} Jest mock function or noop
 */
const createMockFn = (implementation) => {
    if (typeof jest !== 'undefined' && jest.fn) {
        return implementation ? jest.fn(implementation) : jest.fn();
    }
    // Return a noop function with mock properties for non-Jest environments
    const fn = implementation || (() => {});
    fn.mockReturnValue = (val) => {
        fn._mockReturnValue = val;
        return fn;
    };
    fn.mockResolvedValue = (val) => {
        fn._mockResolvedValue = val;
        return fn;
    };
    fn.mockImplementation = (impl) => {
        fn._mockImplementation = impl;
        return fn;
    };
    return fn;
};

/**
 * Default mock user object
 * @type {Object}
 */
const createMockUser = (overrides = {}) => ({
    id: 'user-123',
    appUserId: 'app-user-123',
    username: 'testuser',
    email: 'test@example.com',
    getId: createMockFn(() => overrides.id || 'user-123'),
    ...overrides,
});

/**
 * Default mock credential object
 * @type {Object}
 */
const createMockCredential = (overrides = {}) => ({
    id: 'cred-123',
    type: 'hubspot',
    userId: 'user-123',
    authIsValid: true,
    status: 'AUTHORIZED',
    externalId: 'ext-123',
    entityCount: 2,
    createdAt: '2025-01-25T10:00:00.000Z',
    updatedAt: '2025-01-25T10:00:00.000Z',
    data: {
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
    },
    ...overrides,
});

/**
 * Default mock entity object
 * @type {Object}
 */
const createMockEntity = (overrides = {}) => ({
    id: 'entity-123',
    entityType: 'ACCOUNT',
    credential: 'cred-123',
    credentialId: 'cred-123',
    userId: 'user-123',
    externalId: 'ext-account-123',
    name: 'Test Account',
    authIsValid: true,
    type: 'hubspot',
    ...overrides,
});

/**
 * Default mock integration object
 * @type {Object}
 */
const createMockIntegration = (overrides = {}) => ({
    id: 'integration-123',
    name: 'Test Integration',
    userId: 'user-123',
    config: {},
    entities: ['entity-123'],
    createdAt: '2025-01-25T10:00:00.000Z',
    updatedAt: '2025-01-25T10:00:00.000Z',
    ...overrides,
});

/**
 * Default mock module definition object
 * @type {Object}
 */
const createMockModuleDefinition = (overrides = {}) => {
    const defaults = {
        moduleName: 'hubspot',
        definition: {
            getDisplayName: () => overrides.displayName || 'HubSpot',
            getDescription: () => overrides.description || 'Connect to HubSpot CRM',
            getAuthType: () => overrides.authType || 'oauth2',
            getAuthStepCount: () => overrides.stepCount || 1,
            getCapabilities: () => overrides.capabilities || ['contacts', 'companies', 'deals'],
            getAuthRequirementsForStep: jest.fn().mockResolvedValue({
                type: overrides.authType || 'oauth2',
                data: {
                    url: 'https://app.hubspot.com/oauth/authorize?client_id=test',
                    scopes: ['crm.objects.contacts.read', 'crm.objects.companies.read'],
                },
            }),
            processAuthorizationStep: jest.fn(),
        },
        apiClass: jest.fn(),
    };

    return {
        ...defaults,
        ...overrides,
        definition: {
            ...defaults.definition,
            ...(overrides.definition || {}),
        },
    };
};

/**
 * Collection of mock data generators
 */
const mockData = {
    createMockUser,
    createMockCredential,
    createMockEntity,
    createMockIntegration,
    createMockModuleDefinition,

    // Pre-created instances for quick use
    user: createMockUser(),
    credential: createMockCredential(),
    entity: createMockEntity(),
    integration: createMockIntegration(),
};

// ============================================================================
// Mock Repository Factories
// ============================================================================

/**
 * Create a mock user repository with standard interface
 * @param {Object} overrides - Method overrides
 * @returns {Object} Mock user repository
 */
const createMockUserRepository = (overrides = {}) => ({
    findById: jest.fn().mockResolvedValue(mockData.user),
    findOne: jest.fn().mockResolvedValue(mockData.user),
    findByToken: jest.fn().mockResolvedValue(mockData.user),
    getSessionToken: jest.fn().mockResolvedValue({ user: 'user-123', token: 'valid-token' }),
    findIndividualUserById: jest.fn().mockResolvedValue(mockData.user),
    findOrganizationUserById: jest.fn().mockResolvedValue(null),
    findByEmail: jest.fn().mockResolvedValue(mockData.user),
    findUserById: jest.fn().mockResolvedValue(mockData.user),
    save: jest.fn(),
    update: jest.fn(),
    ...overrides,
});

/**
 * Create a mock credential repository with standard interface
 * @param {Object} overrides - Method overrides
 * @returns {Object} Mock credential repository
 */
const createMockCredentialRepository = (overrides = {}) => ({
    findById: jest.fn(),
    findByIdForUser: jest.fn(),
    findCredential: jest.fn().mockResolvedValue([]),
    findCredentialById: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    updateCredential: jest.fn(),
    deleteCredentialById: jest.fn().mockResolvedValue({ deletedCount: 1 }),
    ...overrides,
});

/**
 * Create a mock module repository with standard interface
 * @param {Object} overrides - Method overrides
 * @returns {Object} Mock module repository
 */
const createMockModuleRepository = (overrides = {}) => ({
    findById: jest.fn(),
    findByIdForUser: jest.fn(),
    findByUserId: jest.fn().mockResolvedValue([]),
    findByUserIdAndType: jest.fn(),
    findModuleById: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
    ...overrides,
});

/**
 * Create a mock integration repository with standard interface
 * @param {Object} overrides - Method overrides
 * @returns {Object} Mock integration repository
 */
const createMockIntegrationRepository = (overrides = {}) => ({
    findById: jest.fn(),
    findByIdForUser: jest.fn(),
    findByUserId: jest.fn().mockResolvedValue([]),
    save: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    ...overrides,
});

/**
 * Create a mock authorization session repository
 * @param {Object} overrides - Method overrides
 * @returns {Object} Mock authorization session repository
 */
const createMockAuthorizationSessionRepository = (overrides = {}) => ({
    findBySessionId: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    ...overrides,
});

/**
 * Create all mock repositories at once
 * @param {Object} overrides - Per-repository overrides
 * @returns {Object} All mock repositories
 */
const createMockRepositories = (overrides = {}) => ({
    userRepository: createMockUserRepository(overrides.user),
    credentialRepository: createMockCredentialRepository(overrides.credential),
    moduleRepository: createMockModuleRepository(overrides.module),
    integrationRepository: createMockIntegrationRepository(overrides.integration),
    authorizationSessionRepository: createMockAuthorizationSessionRepository(overrides.authorizationSession),
});

// ============================================================================
// Mock API Requester
// ============================================================================

/**
 * Create a mock API requester for proxy tests
 * @param {Object} overrides - Method overrides
 * @returns {Object} Mock API requester
 */
const createMockApiRequester = (overrides = {}) => ({
    request: jest.fn().mockResolvedValue({
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: { success: true },
    }),
    _get: jest.fn(),
    _post: jest.fn(),
    _put: jest.fn(),
    _patch: jest.fn(),
    _delete: jest.fn(),
    addAuthHeaders: jest.fn().mockResolvedValue({}),
    ...overrides,
});

/**
 * Create a mock module factory
 * @param {Object} apiRequester - Mock API requester to use
 * @returns {Object} Mock module factory
 */
const createMockModuleFactory = (apiRequester = createMockApiRequester()) => ({
    getModuleInstance: jest.fn().mockResolvedValue({
        api: apiRequester,
    }),
});

// ============================================================================
// Express App Setup
// ============================================================================

/**
 * Boom error handler middleware for Express
 * Converts Boom errors to proper HTTP responses
 * @param {Error} err - Error object
 * @param {Object} req - Express request
 * @param {Object} res - Express response
 * @param {Function} next - Next middleware
 */
const boomErrorHandler = (err, req, res, next) => {
    if (Boom.isBoom(err)) {
        const { statusCode, payload } = err.output;
        return res.status(statusCode).json({
            error: payload.message,
            message: payload.message,
            statusCode: payload.statusCode,
            ...err.data,
        });
    }

    // Handle non-Boom errors
    console.error('Unhandled error:', err);
    return res.status(500).json({
        error: 'Internal Server Error',
        message: err.message,
        statusCode: 500,
    });
};

/**
 * Create authentication middleware for testing
 * @param {Object} options - Configuration options
 * @param {Object} options.mockUser - User to inject on successful auth
 * @param {string} options.validToken - Token that will be considered valid (default: 'valid-token')
 * @returns {Function} Express middleware
 */
const createAuthMiddleware = ({ mockUser = mockData.user, validToken = 'valid-token' } = {}) => {
    return (req, res, next) => {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return next(Boom.unauthorized('No authentication provided'));
        }

        const token = authHeader.replace('Bearer ', '');

        if (token === validToken) {
            req.user = mockUser;
            return next();
        }

        return next(Boom.unauthorized('Invalid token'));
    };
};

/**
 * Create a test Express app with common configuration
 * @param {Object} options - Configuration options
 * @param {Object} options.router - Express router to mount
 * @param {string} options.basePath - Base path for router (default: '/')
 * @param {Object} options.mockUser - User to inject on auth (default: mockData.user)
 * @param {boolean} options.useAuth - Whether to use auth middleware (default: true)
 * @param {string} options.validToken - Valid token string (default: 'valid-token')
 * @returns {Object} Express app instance
 */
const createTestApp = ({
    router,
    basePath = '/',
    mockUser = mockData.user,
    useAuth = true,
    validToken = 'valid-token',
} = {}) => {
    const app = express();
    app.use(express.json());

    if (useAuth) {
        app.use(createAuthMiddleware({ mockUser, validToken }));
    }

    if (router) {
        app.use(basePath, router);
    }

    // Add Boom error handler (must be after routes)
    app.use(boomErrorHandler);

    return app;
};

// ============================================================================
// Database Config Mock
// ============================================================================

/**
 * Standard database config mock object
 * Use this to mock '../database/config' in tests
 */
const databaseConfigMock = {
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
};

// ============================================================================
// App Definition Mock
// ============================================================================

/**
 * Create a mock app definition
 * @param {Object} overrides - Override specific properties
 * @returns {Object} Mock app definition
 */
const createMockAppDefinition = (overrides = {}) => ({
    integrations: overrides.integrations || [
        createMockModuleDefinition({ moduleName: 'hubspot' }),
        createMockModuleDefinition({
            moduleName: 'salesforce',
            displayName: 'Salesforce',
            description: 'Connect to Salesforce CRM',
            capabilities: ['accounts', 'contacts', 'opportunities'],
        }),
    ],
    userConfig: {
        usePassword: true,
        primary: 'individual',
        authModes: {
            friggToken: true,
        },
        ...(overrides.userConfig || {}),
    },
    ...overrides,
});

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Helper to make authenticated requests
 * @param {Object} app - Express app
 * @param {string} token - Auth token (default: 'valid-token')
 * @returns {Object} Supertest agent with auth header set
 */
const authenticatedRequest = (request, token = 'valid-token') => {
    return {
        get: (url) => request.get(url).set('Authorization', `Bearer ${token}`),
        post: (url) => request.post(url).set('Authorization', `Bearer ${token}`),
        put: (url) => request.put(url).set('Authorization', `Bearer ${token}`),
        patch: (url) => request.patch(url).set('Authorization', `Bearer ${token}`),
        delete: (url) => request.delete(url).set('Authorization', `Bearer ${token}`),
    };
};

/**
 * Setup common jest mocks for repository factories
 * Call this at the top of your test file after imports
 * @param {Object} factoryMocks - Map of factory name to mock repository
 */
const setupRepositoryFactoryMocks = ({
    createUserRepository,
    createCredentialRepository,
    createModuleRepository,
    createIntegrationRepository,
    createAuthorizationSessionRepository,
    loadAppDefinition,
    mocks,
}) => {
    if (createUserRepository && mocks.userRepository) {
        createUserRepository.mockReturnValue(mocks.userRepository);
    }
    if (createCredentialRepository && mocks.credentialRepository) {
        createCredentialRepository.mockReturnValue(mocks.credentialRepository);
    }
    if (createModuleRepository && mocks.moduleRepository) {
        createModuleRepository.mockReturnValue(mocks.moduleRepository);
    }
    if (createIntegrationRepository && mocks.integrationRepository) {
        createIntegrationRepository.mockReturnValue(mocks.integrationRepository);
    }
    if (createAuthorizationSessionRepository && mocks.authorizationSessionRepository) {
        createAuthorizationSessionRepository.mockReturnValue(mocks.authorizationSessionRepository);
    }
    if (loadAppDefinition) {
        loadAppDefinition.mockReturnValue(createMockAppDefinition());
    }
};

// ============================================================================
// Exports
// ============================================================================

module.exports = {
    // Mock data generators
    mockData,
    createMockUser,
    createMockCredential,
    createMockEntity,
    createMockIntegration,
    createMockModuleDefinition,

    // Repository mocks
    createMockUserRepository,
    createMockCredentialRepository,
    createMockModuleRepository,
    createMockIntegrationRepository,
    createMockAuthorizationSessionRepository,
    createMockRepositories,

    // API/Factory mocks
    createMockApiRequester,
    createMockModuleFactory,

    // Express app utilities
    createTestApp,
    createAuthMiddleware,
    boomErrorHandler,

    // Config mocks
    databaseConfigMock,
    createMockAppDefinition,

    // Test helpers
    authenticatedRequest,
    setupRepositoryFactoryMocks,
};
