/**
 * API Versioning Tests for /api/integrations endpoint
 *
 * v1 Response Shape (legacy - on `next` branch):
 * {
 *   entities: {
 *     options: [...],     // Available integration types (getPossibleIntegrations)
 *     authorized: [...]   // User's connected entities (getEntitiesForUser)
 *   },
 *   integrations: [...]   // User's active integrations
 * }
 *
 * v2 Response Shape (current branch - cleaner separation):
 * {
 *   integrations: [...]   // ONLY integrations
 * }
 *
 * v2 splits entities into separate endpoints:
 * - GET /api/integrations/options → available integration types
 * - GET /api/entities → user's connected entities
 *
 * TDD APPROACH:
 * - v1 tests will FAIL until we implement backwards compatibility
 * - v2 tests should PASS (current behavior)
 * - Once we implement v1 support, all tests should pass
 */

// Database config mock must come first
jest.mock('../../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
}));

// Mock the repository factories
jest.mock('../../repositories/integration-repository-factory');
jest.mock('../../../modules/repositories/module-repository-factory');
jest.mock('../../../credential/repositories/credential-repository-factory');
jest.mock('../../../user/repositories/user-repository-factory');
jest.mock(
    '../../../modules/repositories/authorization-session-repository-factory'
);
jest.mock('../../../handlers/app-definition-loader');

// Mock the use cases that have complex dependencies
jest.mock('../../use-cases/get-integrations-for-user');
jest.mock('../../../modules/use-cases/get-entities-for-user');
jest.mock('../../use-cases/get-possible-integrations');

const request = require('supertest');
const express = require('express');

const {
    createIntegrationRepository,
} = require('../../repositories/integration-repository-factory');
const {
    createModuleRepository,
} = require('../../../modules/repositories/module-repository-factory');
const {
    createCredentialRepository,
} = require('../../../credential/repositories/credential-repository-factory');
const {
    createUserRepository,
} = require('../../../user/repositories/user-repository-factory');
const {
    createAuthorizationSessionRepository,
} = require('../../../modules/repositories/authorization-session-repository-factory');
const {
    loadAppDefinition,
} = require('../../../handlers/app-definition-loader');

const {
    GetIntegrationsForUser,
} = require('../../use-cases/get-integrations-for-user');
const {
    GetEntitiesForUser,
} = require('../../../modules/use-cases/get-entities-for-user');
const {
    GetPossibleIntegrations,
} = require('../../use-cases/get-possible-integrations');

const {
    createMockUser,
    createMockEntity,
    createMockRepositories,
    boomErrorHandler,
} = require('@friggframework/test/router-test-utils');

// Mock integration class
const MockIntegrationClass = {
    Definition: {
        name: 'test-integration',
        modules: {
            testModule: {
                definition: {
                    moduleName: 'test-module',
                    getName: () => 'Test Module',
                    getDisplayName: () => 'Test Module',
                    getDescription: () => 'A test module',
                    getAuthType: () => 'oauth2',
                    getAuthStepCount: () => 1,
                    getCapabilities: () => ['test'],
                },
            },
        },
    },
    getOptionDetails: () => ({
        name: 'Test Integration',
        description: 'A test integration',
        type: 'test-integration',
    }),
};

describe('Integration Router API Versioning', () => {
    let app;
    let mocks;
    let mockUser;
    let mockGetIntegrationsForUser;
    let mockGetEntitiesForUser;
    let mockGetPossibleIntegrations;

    beforeEach(() => {
        jest.clearAllMocks();

        mockUser = createMockUser({ id: 'user-123' });
        mocks = createMockRepositories();

        // Setup mock returns for repositories
        mocks.userRepository.findById.mockResolvedValue(mockUser);
        mocks.userRepository.getSessionToken.mockResolvedValue({
            user: 'user-123',
            token: 'valid-token',
        });

        // Wire up mocked factories
        createIntegrationRepository.mockReturnValue(
            mocks.integrationRepository
        );
        createModuleRepository.mockReturnValue(mocks.moduleRepository);
        createCredentialRepository.mockReturnValue(mocks.credentialRepository);
        createUserRepository.mockReturnValue(mocks.userRepository);
        createAuthorizationSessionRepository.mockReturnValue(
            mocks.authorizationSessionRepository
        );

        // Setup mock use case instances
        mockGetIntegrationsForUser = {
            execute: jest.fn().mockResolvedValue([]),
        };
        mockGetEntitiesForUser = { execute: jest.fn().mockResolvedValue([]) };
        mockGetPossibleIntegrations = {
            execute: jest
                .fn()
                .mockResolvedValue([
                    {
                        type: 'test-integration',
                        name: 'Test Integration',
                        modules: ['test-module'],
                    },
                ]),
        };

        GetIntegrationsForUser.mockImplementation(
            () => mockGetIntegrationsForUser
        );
        GetEntitiesForUser.mockImplementation(() => mockGetEntitiesForUser);
        GetPossibleIntegrations.mockImplementation(
            () => mockGetPossibleIntegrations
        );

        loadAppDefinition.mockReturnValue({
            integrations: [MockIntegrationClass],
            userConfig: {
                primary: 'individual',
                authModes: { friggToken: true },
            },
        });

        // Create router fresh for each test
        const { createIntegrationRouter } = require('../../integration-router');
        const router = createIntegrationRouter();

        app = express();
        app.use(express.json());
        app.use('/', router);
        app.use(boomErrorHandler);
    });

    describe('v1 - GET /api/integrations (legacy combined response)', () => {
        /**
         * v1 returns everything in one call:
         * - entities.options: available integration types
         * - entities.authorized: user's connected entities
         * - integrations: user's active integrations
         *
         * This is the format on the `next` branch that we need to support
         * for backwards compatibility.
         *
         * These tests WILL FAIL until we implement v1 support.
         */

        it('returns combined response with entities.options, entities.authorized, and integrations', async () => {
            // Setup mock data
            const mockIntegration = {
                id: 'int-1',
                userId: 'user-123',
                config: { type: 'test-integration' },
                status: 'ENABLED',
                entities: [{ id: 'entity-1', type: 'test-module' }],
            };
            const mockEntity = createMockEntity({
                id: 'entity-1',
                type: 'test-module',
                name: 'My Test Account',
                userId: 'user-123',
            });

            mockGetIntegrationsForUser.execute.mockResolvedValue([
                mockIntegration,
            ]);
            mockGetEntitiesForUser.execute.mockResolvedValue([mockEntity]);

            // Make v1 request (no version prefix)
            const res = await request(app)
                .get('/api/integrations')
                .set('Authorization', 'Bearer valid-token');

            expect(res.status).toBe(200);

            // v1 response shape assertions - THIS WILL FAIL until we implement v1 support
            expect(res.body).toHaveProperty('entities');
            expect(res.body).toHaveProperty('integrations');

            // entities.options - available integration types
            expect(res.body.entities).toHaveProperty('options');
            expect(Array.isArray(res.body.entities.options)).toBe(true);

            // entities.authorized - user's connected entities
            expect(res.body.entities).toHaveProperty('authorized');
            expect(Array.isArray(res.body.entities.authorized)).toBe(true);

            // integrations - user's active integrations
            expect(Array.isArray(res.body.integrations)).toBe(true);
        });

        it('returns empty arrays when user has no data', async () => {
            const res = await request(app)
                .get('/api/integrations')
                .set('Authorization', 'Bearer valid-token');

            expect(res.status).toBe(200);

            // v1 format - THIS WILL FAIL until we implement v1 support
            expect(res.body).toEqual({
                entities: {
                    options: expect.any(Array),
                    authorized: [],
                },
                integrations: [],
            });
        });

        it('entities.options contains available integration type definitions', async () => {
            const res = await request(app)
                .get('/api/integrations')
                .set('Authorization', 'Bearer valid-token');

            expect(res.status).toBe(200);

            // v1 format - THIS WILL FAIL until we implement v1 support
            expect(res.body.entities).toBeDefined();
            expect(res.body.entities.options).toBeDefined();
            expect(res.body.entities.options.length).toBeGreaterThan(0);
            expect(res.body.entities.options[0]).toHaveProperty('type');
        });
    });

    describe('v2 - GET /api/v2/integrations (clean separated response)', () => {
        /**
         * v2 returns ONLY integrations via /api/v2/integrations path.
         * These tests should PASS.
         */

        it('returns only integrations array (v2 format)', async () => {
            const mockIntegration = {
                id: 'int-1',
                userId: 'user-123',
                config: { type: 'test-integration' },
                status: 'ENABLED',
            };

            mockGetIntegrationsForUser.execute.mockResolvedValue([
                mockIntegration,
            ]);

            const res = await request(app)
                .get('/api/v2/integrations')
                .set('Authorization', 'Bearer valid-token');

            expect(res.status).toBe(200);

            // v2 response shape - ONLY integrations, NO entities wrapper
            expect(res.body).toHaveProperty('integrations');
            expect(res.body).not.toHaveProperty('entities');
            expect(Array.isArray(res.body.integrations)).toBe(true);
        });

        it('returns empty integrations array when user has none', async () => {
            const res = await request(app)
                .get('/api/v2/integrations')
                .set('Authorization', 'Bearer valid-token');

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                integrations: [],
            });
        });
    });

    describe('v2 - GET /api/integrations/options (split from v1 entities.options)', () => {
        /**
         * This is v2's separate endpoint for integration options.
         * Should PASS - this is current behavior.
         */

        it('returns available integration types', async () => {
            const res = await request(app)
                .get('/api/integrations/options')
                .set('Authorization', 'Bearer valid-token');

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('integrations');
            expect(Array.isArray(res.body.integrations)).toBe(true);

            // Each option should describe an available integration type
            expect(res.body.integrations.length).toBeGreaterThan(0);
            expect(res.body.integrations[0]).toHaveProperty('type');
        });
    });

    describe('v2 - GET /api/entities (split from v1 entities.authorized)', () => {
        /**
         * This is v2's separate endpoint for user entities.
         * Should PASS - this is current behavior.
         */

        it('returns user connected entities', async () => {
            const mockEntity = createMockEntity({
                id: 'entity-1',
                type: 'test-module',
                name: 'My Test Account',
            });
            mockGetEntitiesForUser.execute.mockResolvedValue([mockEntity]);

            const res = await request(app)
                .get('/api/entities')
                .set('Authorization', 'Bearer valid-token');

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('entities');
            expect(Array.isArray(res.body.entities)).toBe(true);
        });

        it('returns empty entities array when user has none', async () => {
            const res = await request(app)
                .get('/api/entities')
                .set('Authorization', 'Bearer valid-token');

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                entities: [],
            });
        });
    });
});

describe('v1 Backwards Compatibility - Path-based versioning', () => {
    /**
     * These tests define the path-based versioning strategy:
     * - /api/* → v1 format (backwards compatible)
     * - /api/v2/* → v2 format (new clean format)
     *
     * All these tests WILL FAIL until we implement the versioning layer.
     */

    let app;
    let mockGetIntegrationsForUser;
    let mockGetEntitiesForUser;
    let mockGetPossibleIntegrations;

    beforeEach(() => {
        jest.clearAllMocks();

        const mockUser = createMockUser({ id: 'user-123' });
        const mocks = createMockRepositories();

        mocks.userRepository.findById.mockResolvedValue(mockUser);
        mocks.userRepository.getSessionToken.mockResolvedValue({
            user: 'user-123',
            token: 'valid-token',
        });

        createIntegrationRepository.mockReturnValue(
            mocks.integrationRepository
        );
        createModuleRepository.mockReturnValue(mocks.moduleRepository);
        createCredentialRepository.mockReturnValue(mocks.credentialRepository);
        createUserRepository.mockReturnValue(mocks.userRepository);
        createAuthorizationSessionRepository.mockReturnValue(
            mocks.authorizationSessionRepository
        );

        mockGetIntegrationsForUser = {
            execute: jest.fn().mockResolvedValue([]),
        };
        mockGetEntitiesForUser = { execute: jest.fn().mockResolvedValue([]) };
        mockGetPossibleIntegrations = {
            execute: jest
                .fn()
                .mockResolvedValue([
                    { type: 'test-integration', name: 'Test Integration' },
                ]),
        };

        GetIntegrationsForUser.mockImplementation(
            () => mockGetIntegrationsForUser
        );
        GetEntitiesForUser.mockImplementation(() => mockGetEntitiesForUser);
        GetPossibleIntegrations.mockImplementation(
            () => mockGetPossibleIntegrations
        );

        loadAppDefinition.mockReturnValue({
            integrations: [
                {
                    Definition: {
                        name: 'test-integration',
                        modules: {
                            testModule: {
                                definition: {
                                    moduleName: 'test-module',
                                    getDisplayName: () => 'Test Module',
                                    getAuthStepCount: () => 1,
                                },
                            },
                        },
                    },
                    getOptionDetails: () => ({
                        type: 'test-integration',
                        name: 'Test Integration',
                    }),
                },
            ],
            userConfig: {
                primary: 'individual',
                authModes: { friggToken: true },
            },
        });

        const { createIntegrationRouter } = require('../../integration-router');
        const router = createIntegrationRouter();

        app = express();
        app.use(express.json());
        app.use('/', router);
        app.use(boomErrorHandler);
    });

    it('GET /api/integrations returns v1 combined format by default', async () => {
        const res = await request(app)
            .get('/api/integrations')
            .set('Authorization', 'Bearer valid-token');

        expect(res.status).toBe(200);

        // v1 format: includes entities wrapper
        expect(res.body).toHaveProperty('entities');
        expect(res.body.entities).toHaveProperty('options');
        expect(res.body.entities).toHaveProperty('authorized');
        expect(res.body).toHaveProperty('integrations');
    });

    it('GET /api/v2/integrations returns v2 clean format', async () => {
        const res = await request(app)
            .get('/api/v2/integrations')
            .set('Authorization', 'Bearer valid-token');

        // This will 404 until we add /api/v2 routes
        expect(res.status).toBe(200);

        // v2 format: only integrations, no entities wrapper
        expect(res.body).toHaveProperty('integrations');
        expect(res.body).not.toHaveProperty('entities');
    });
});

describe('Data equivalence between v1 and v2', () => {
    /**
     * These tests verify that the SAME data is available,
     * just structured differently between versions.
     */

    let app;
    let mockIntegration;
    let mockEntity;
    let mockOptions;

    beforeEach(() => {
        jest.clearAllMocks();

        mockIntegration = {
            id: 'int-1',
            config: { type: 'test-integration' },
            status: 'ENABLED',
        };
        mockEntity = createMockEntity({
            id: 'entity-1',
            type: 'test-module',
            name: 'My Account',
        });
        mockOptions = [{ type: 'test-integration', name: 'Test Integration' }];

        const mockUser = createMockUser({ id: 'user-123' });
        const mocks = createMockRepositories();

        mocks.userRepository.findById.mockResolvedValue(mockUser);
        mocks.userRepository.getSessionToken.mockResolvedValue({
            user: 'user-123',
            token: 'valid-token',
        });

        createIntegrationRepository.mockReturnValue(
            mocks.integrationRepository
        );
        createModuleRepository.mockReturnValue(mocks.moduleRepository);
        createCredentialRepository.mockReturnValue(mocks.credentialRepository);
        createUserRepository.mockReturnValue(mocks.userRepository);
        createAuthorizationSessionRepository.mockReturnValue(
            mocks.authorizationSessionRepository
        );

        const mockGetIntegrationsForUser = {
            execute: jest.fn().mockResolvedValue([mockIntegration]),
        };
        const mockGetEntitiesForUser = {
            execute: jest.fn().mockResolvedValue([mockEntity]),
        };
        const mockGetPossibleIntegrations = {
            execute: jest.fn().mockResolvedValue(mockOptions),
        };

        GetIntegrationsForUser.mockImplementation(
            () => mockGetIntegrationsForUser
        );
        GetEntitiesForUser.mockImplementation(() => mockGetEntitiesForUser);
        GetPossibleIntegrations.mockImplementation(
            () => mockGetPossibleIntegrations
        );

        loadAppDefinition.mockReturnValue({
            integrations: [
                {
                    Definition: {
                        name: 'test-integration',
                        modules: {
                            testModule: {
                                definition: {
                                    moduleName: 'test-module',
                                    getDisplayName: () => 'Test Module',
                                    getAuthStepCount: () => 1,
                                },
                            },
                        },
                    },
                    getOptionDetails: () => ({
                        type: 'test-integration',
                        name: 'Test Integration',
                    }),
                },
            ],
            userConfig: {
                primary: 'individual',
                authModes: { friggToken: true },
            },
        });

        const { createIntegrationRouter } = require('../../integration-router');
        const router = createIntegrationRouter();

        app = express();
        app.use(express.json());
        app.use('/', router);
        app.use(boomErrorHandler);
    });

    it('v1 entities.options contains same data as v2 GET /api/integrations/options', async () => {
        // Get v1 response
        const v1Res = await request(app)
            .get('/api/integrations')
            .set('Authorization', 'Bearer valid-token');

        // Get v2 response
        const v2Res = await request(app)
            .get('/api/integrations/options')
            .set('Authorization', 'Bearer valid-token');

        expect(v1Res.status).toBe(200);
        expect(v2Res.status).toBe(200);

        // Data should be equivalent
        // v1: res.body.entities.options
        // v2: res.body.integrations
        expect(v1Res.body.entities.options).toEqual(v2Res.body.integrations);
    });

    it('v1 entities.authorized contains same data as v2 GET /api/entities', async () => {
        // Get v1 response
        const v1Res = await request(app)
            .get('/api/integrations')
            .set('Authorization', 'Bearer valid-token');

        // Get v2 response
        const v2Res = await request(app)
            .get('/api/entities')
            .set('Authorization', 'Bearer valid-token');

        expect(v1Res.status).toBe(200);
        expect(v2Res.status).toBe(200);

        // Data should be equivalent
        // v1: res.body.entities.authorized
        // v2: res.body.entities
        expect(v1Res.body.entities.authorized).toEqual(v2Res.body.entities);
    });

    it('v1 integrations contains same data as v2 GET /api/integrations', async () => {
        // Both endpoints return integrations, just v1 also includes entities wrapper
        const v1Res = await request(app)
            .get('/api/integrations')
            .set('Authorization', 'Bearer valid-token');

        expect(v1Res.status).toBe(200);

        // v1.integrations should match the integration data
        expect(v1Res.body.integrations).toEqual([mockIntegration]);
    });
});
