/**
 * @file Entity Types Router Tests (TDD)
 * @description Test-Driven Development tests for new /api/entities/types/* endpoints
 *
 * These tests are written FIRST to drive the implementation of:
 * - GET /api/entities/types - List all available entity types
 * - GET /api/entities/types/:typeName - Get details for a specific entity type
 * - GET /api/entities/types/:typeName/requirements - Get auth requirements for an entity type
 * - POST /api/entities/:id/reauthorize - Reauthorize a specific entity
 *
 * Tests follow TDD red-green-refactor cycle and validate against JSON schemas:
 * - api-entities.schema.json
 * - api-authorization.schema.json
 */

const request = require('supertest');
const express = require('express');
const Boom = require('@hapi/boom');

// Mock dependencies before requiring the router
jest.mock('../handlers/app-definition-loader', () => ({
    loadAppDefinition: jest.fn(),
}));

jest.mock('./repositories/integration-repository-factory', () => ({
    createIntegrationRepository: jest.fn(),
}));

jest.mock('../credential/repositories/credential-repository-factory', () => ({
    createCredentialRepository: jest.fn(),
}));

jest.mock('../user/repositories/user-repository-factory', () => ({
    createUserRepository: jest.fn(),
}));

jest.mock(
    '../modules/repositories/authorization-session-repository-factory',
    () => ({
        createAuthorizationSessionRepository: jest.fn(),
    })
);

jest.mock('../modules/repositories/module-repository-factory', () => ({
    createModuleRepository: jest.fn(),
}));

jest.mock('../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
}));

// Mock ProcessAuthorizationCallback for reauthorize tests
const mockProcessAuthorizationCallbackExecute = jest.fn();
jest.mock('../modules/use-cases/process-authorization-callback', () => ({
    ProcessAuthorizationCallback: jest.fn().mockImplementation(() => ({
        execute: mockProcessAuthorizationCallbackExecute,
    })),
}));

// Mock ProcessAuthorizationStepUseCase for multi-step reauthorize tests
const mockProcessAuthorizationStepExecute = jest.fn();
jest.mock('../modules/use-cases/process-authorization-step', () => ({
    ProcessAuthorizationStepUseCase: jest.fn().mockImplementation(() => ({
        execute: mockProcessAuthorizationStepExecute,
    })),
}));

// Mock StartAuthorizationSessionUseCase for multi-step flows
const mockStartAuthorizationSessionExecute = jest.fn();
jest.mock('../modules/use-cases/start-authorization-session', () => ({
    StartAuthorizationSessionUseCase: jest.fn().mockImplementation(() => ({
        execute: mockStartAuthorizationSessionExecute,
    })),
}));

const { createIntegrationRouter } = require('./integration-router');
const { loadAppDefinition } = require('../handlers/app-definition-loader');
const {
    createIntegrationRepository,
} = require('./repositories/integration-repository-factory');
const {
    createCredentialRepository,
} = require('../credential/repositories/credential-repository-factory');
const {
    createUserRepository,
} = require('../user/repositories/user-repository-factory');
const {
    createAuthorizationSessionRepository,
} = require('../modules/repositories/authorization-session-repository-factory');
const {
    createModuleRepository,
} = require('../modules/repositories/module-repository-factory');

describe('Entity Types Router - TDD Tests', () => {
    let app;
    let mockUserRepository;
    let mockModuleRepository;
    let mockCredentialRepository;
    let mockUser;
    let mockModuleDefinitions;

    beforeEach(() => {
        // Mock user for authentication
        mockUser = {
            getId: jest.fn().mockReturnValue('user-123'),
            id: 'user-123',
        };

        // Mock user repository with all auth-related methods
        mockUserRepository = {
            findById: jest.fn().mockResolvedValue(mockUser),
            findByToken: jest.fn().mockResolvedValue(mockUser),
            getSessionToken: jest
                .fn()
                .mockResolvedValue({ user: 'user-123', token: 'valid-token' }),
            findIndividualUserById: jest.fn().mockResolvedValue(mockUser),
            findOrganizationUserById: jest.fn().mockResolvedValue(null),
            findByEmail: jest.fn().mockResolvedValue(mockUser),
        };

        // Mock module repository
        mockModuleRepository = {
            findById: jest.fn(),
            findByUserId: jest.fn(),
            findByUserIdAndType: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
        };

        // Mock credential repository
        mockCredentialRepository = {
            findById: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
        };

        // Mock module definitions with various auth types
        mockModuleDefinitions = [
            {
                moduleName: 'hubspot',
                definition: {
                    getDisplayName: () => 'HubSpot',
                    getDescription: () => 'Connect to HubSpot CRM',
                    getAuthType: () => 'oauth2',
                    getAuthStepCount: () => 1,
                    getCapabilities: () => ['contacts', 'companies', 'deals'],
                    getAuthRequirementsForStep: jest.fn().mockResolvedValue({
                        type: 'oauth2',
                        data: {
                            url: 'https://app.hubspot.com/oauth/authorize?client_id=test',
                            scopes: [
                                'crm.objects.contacts.read',
                                'crm.objects.companies.read',
                            ],
                        },
                    }),
                    processAuthorizationStep: jest.fn(),
                },
                apiClass: jest.fn(),
            },
            {
                moduleName: 'salesforce',
                definition: {
                    getDisplayName: () => 'Salesforce',
                    getDescription: () => 'Connect to Salesforce CRM',
                    getAuthType: () => 'oauth2',
                    getAuthStepCount: () => 1,
                    getCapabilities: () => [
                        'accounts',
                        'contacts',
                        'opportunities',
                    ],
                    getAuthRequirementsForStep: jest.fn().mockResolvedValue({
                        type: 'oauth2',
                        data: {
                            url: 'https://login.salesforce.com/services/oauth2/authorize',
                            scopes: ['api', 'refresh_token'],
                        },
                    }),
                    processAuthorizationStep: jest.fn(),
                },
                apiClass: jest.fn(),
            },
            {
                moduleName: 'slack',
                definition: {
                    getDisplayName: () => 'Slack',
                    getDescription: () => 'Connect to Slack workspace',
                    getAuthType: () => 'oauth2',
                    getAuthStepCount: () => 1,
                    getCapabilities: () => ['channels', 'messages', 'users'],
                    getAuthRequirementsForStep: jest.fn(),
                    processAuthorizationStep: jest.fn(),
                },
                apiClass: jest.fn(),
            },
            {
                moduleName: 'custom-api',
                definition: {
                    getDisplayName: () => 'Custom API',
                    getDescription: () => 'Connect with API key',
                    getAuthType: () => 'api-key',
                    getAuthStepCount: () => 1,
                    getCapabilities: () => ['read', 'write'],
                    getAuthRequirementsForStep: jest.fn().mockResolvedValue({
                        type: 'api-key',
                        data: {
                            fields: [
                                {
                                    name: 'api_key',
                                    type: 'api_key',
                                    label: 'API Key',
                                    required: true,
                                },
                                {
                                    name: 'api_secret',
                                    type: 'secret',
                                    label: 'API Secret',
                                    required: true,
                                },
                            ],
                        },
                    }),
                    processAuthorizationStep: jest.fn(),
                },
                apiClass: jest.fn(),
            },
            {
                moduleName: 'multi-step-service',
                definition: {
                    getDisplayName: () => 'Multi-Step Service',
                    getDescription: () =>
                        'Service with multi-step authentication',
                    getAuthType: () => 'form',
                    getAuthStepCount: () => 3,
                    getCapabilities: () => ['read', 'write'],
                    getAuthRequirementsForStep: jest
                        .fn()
                        .mockImplementation((step) => {
                            if (step === 1) {
                                return Promise.resolve({
                                    type: 'form',
                                    data: {
                                        jsonSchema: {
                                            title: 'Step 1: Email',
                                            type: 'object',
                                            required: ['email'],
                                            properties: {
                                                email: {
                                                    type: 'string',
                                                    format: 'email',
                                                    title: 'Email',
                                                },
                                            },
                                        },
                                    },
                                });
                            } else if (step === 2) {
                                return Promise.resolve({
                                    type: 'form',
                                    data: {
                                        jsonSchema: {
                                            title: 'Step 2: OTP',
                                            type: 'object',
                                            required: ['otp'],
                                            properties: {
                                                otp: {
                                                    type: 'string',
                                                    title: 'One-Time Password',
                                                },
                                            },
                                        },
                                    },
                                });
                            } else {
                                return Promise.resolve({
                                    type: 'form',
                                    data: {
                                        jsonSchema: {
                                            title: 'Step 3: Password',
                                            type: 'object',
                                            required: ['password'],
                                            properties: {
                                                password: {
                                                    type: 'string',
                                                    format: 'password',
                                                    title: 'Password',
                                                },
                                            },
                                        },
                                    },
                                });
                            }
                        }),
                    processAuthorizationStep: jest.fn(),
                },
                apiClass: jest.fn(),
            },
        ];

        // Mock loadAppDefinition to return our module definitions
        loadAppDefinition.mockReturnValue({
            integrations: mockModuleDefinitions,
            userConfig: {
                usePassword: true,
                primary: 'individual',
            },
        });

        // Mock repository factories
        createUserRepository.mockReturnValue(mockUserRepository);
        createModuleRepository.mockReturnValue(mockModuleRepository);
        createCredentialRepository.mockReturnValue(mockCredentialRepository);
        createIntegrationRepository.mockReturnValue({
            findById: jest.fn(),
            findByUserId: jest.fn(),
            save: jest.fn(),
        });
        createAuthorizationSessionRepository.mockReturnValue({
            findBySessionId: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        });

        // Create Express app with router
        app = express();
        app.use(express.json());
        const router = createIntegrationRouter();
        app.use('/', router);

        // Add Boom error handler (must be after routes)
        app.use((err, req, res, next) => {
            if (Boom.isBoom(err)) {
                const { statusCode, payload } = err.output;
                return res.status(statusCode).json({
                    error: payload.error,
                    message: payload.message,
                    statusCode: payload.statusCode,
                });
            }
            // Handle non-Boom errors
            res.status(500).json({
                error: 'Internal Server Error',
                message: err.message,
            });
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    // =========================================================================
    // GET /api/entities/types - List all available entity types
    // =========================================================================

    describe('GET /api/entities/types', () => {
        describe('Success Cases', () => {
            it('should return list of all available entity types', async () => {
                const response = await request(app)
                    .get('/api/entities/types')
                    .set('Authorization', 'Bearer valid-token')
                    .expect(200);

                // Validate response structure matches listEntityTypesResponse schema
                expect(response.body).toHaveProperty('types');
                expect(Array.isArray(response.body.types)).toBe(true);
                expect(response.body.types.length).toBeGreaterThan(0);
            });

            it('should include all required fields for each entity type', async () => {
                const response = await request(app)
                    .get('/api/entities/types')
                    .set('Authorization', 'Bearer valid-token')
                    .expect(200);

                const entityType = response.body.types[0];

                // Required fields from entityType schema
                expect(entityType).toHaveProperty('type');
                expect(entityType).toHaveProperty('name');
                expect(typeof entityType.type).toBe('string');
                expect(typeof entityType.name).toBe('string');
            });

            it('should include optional fields when available', async () => {
                const response = await request(app)
                    .get('/api/entities/types')
                    .set('Authorization', 'Bearer valid-token')
                    .expect(200);

                const hubspot = response.body.types.find(
                    (t) => t.type === 'hubspot'
                );

                expect(hubspot).toBeDefined();
                expect(hubspot.description).toBe('Connect to HubSpot CRM');
                expect(hubspot.authType).toBe('oauth2');
                expect(hubspot.isMultiStep).toBe(false);
                expect(hubspot.stepCount).toBe(1);
                expect(Array.isArray(hubspot.capabilities)).toBe(true);
                expect(hubspot.capabilities).toContain('contacts');
            });

            it('should correctly identify single-step authentication', async () => {
                const response = await request(app)
                    .get('/api/entities/types')
                    .set('Authorization', 'Bearer valid-token')
                    .expect(200);

                const singleStep = response.body.types.find(
                    (t) => t.type === 'salesforce'
                );

                expect(singleStep).toBeDefined();
                expect(singleStep.isMultiStep).toBe(false);
                expect(singleStep.stepCount).toBe(1);
            });

            it('should correctly identify multi-step authentication', async () => {
                const response = await request(app)
                    .get('/api/entities/types')
                    .set('Authorization', 'Bearer valid-token')
                    .expect(200);

                const multiStep = response.body.types.find(
                    (t) => t.type === 'multi-step-service'
                );

                expect(multiStep).toBeDefined();
                expect(multiStep.isMultiStep).toBe(true);
                expect(multiStep.stepCount).toBe(3);
            });

            it('should include different auth types', async () => {
                const response = await request(app)
                    .get('/api/entities/types')
                    .set('Authorization', 'Bearer valid-token')
                    .expect(200);

                const authTypes = new Set(
                    response.body.types.map((t) => t.authType)
                );

                expect(authTypes.has('oauth2')).toBe(true);
                expect(authTypes.has('api-key')).toBe(true);
                expect(authTypes.has('form')).toBe(true);
            });

            it('should return entity types sorted by name', async () => {
                const response = await request(app)
                    .get('/api/entities/types')
                    .set('Authorization', 'Bearer valid-token')
                    .expect(200);

                const names = response.body.types.map((t) => t.name);
                const sortedNames = [...names].sort();

                expect(names).toEqual(sortedNames);
            });
        });

        describe('Error Cases', () => {
            it('should return 401 when no authentication provided', async () => {
                const response = await request(app)
                    .get('/api/entities/types')
                    .expect(401);

                expect(response.body).toHaveProperty('error');
            });

            it('should return 401 when invalid token provided', async () => {
                mockUserRepository.getSessionToken.mockResolvedValueOnce(null);

                const response = await request(app)
                    .get('/api/entities/types')
                    .set('Authorization', 'Bearer invalid-token')
                    .expect(401);

                expect(response.body).toHaveProperty('error');
            });

            it('should return 500 when module definitions cannot be loaded', async () => {
                // Mock loadAppDefinition to throw error
                loadAppDefinition.mockImplementation(() => {
                    throw new Error('Failed to load module definitions');
                });

                // Recreate app with the new mock to trigger error during router creation
                const errorApp = express();
                errorApp.use(express.json());

                // The router creation should throw, but let's wrap it
                try {
                    const router = createIntegrationRouter();
                    errorApp.use('/', router);
                    errorApp.use((err, req, res, next) => {
                        if (Boom.isBoom(err)) {
                            const { statusCode, payload } = err.output;
                            return res.status(statusCode).json({
                                error: payload.error,
                                message: payload.message,
                                statusCode: payload.statusCode,
                            });
                        }
                        res.status(500).json({
                            error: 'Internal Server Error',
                            message: err.message,
                        });
                    });

                    const response = await request(errorApp)
                        .get('/api/entities/types')
                        .set('Authorization', 'Bearer valid-token');

                    // The router itself might fail to load, or the route might fail
                    expect(response.status).toBe(500);
                    expect(response.body).toHaveProperty('error');
                } catch (error) {
                    // Router creation failed, which is also acceptable behavior
                    expect(error.message).toContain(
                        'Failed to load module definitions'
                    );
                }
            });
        });
    });

    // =========================================================================
    // GET /api/entities/types/:typeName - Get details for specific entity type
    // =========================================================================

    describe('GET /api/entities/types/:typeName', () => {
        describe('Success Cases', () => {
            it('should return details for a specific entity type', async () => {
                const response = await request(app)
                    .get('/api/entities/types/hubspot')
                    .set('Authorization', 'Bearer valid-token')
                    .expect(200);

                // Validate response structure matches getEntityTypeResponse schema
                expect(response.body.type).toBe('hubspot');
                expect(response.body.name).toBe('HubSpot');
                expect(response.body.description).toBe(
                    'Connect to HubSpot CRM'
                );
                expect(response.body.authType).toBe('oauth2');
            });

            it('should include all optional fields when available', async () => {
                const response = await request(app)
                    .get('/api/entities/types/multi-step-service')
                    .set('Authorization', 'Bearer valid-token')
                    .expect(200);

                expect(response.body.type).toBe('multi-step-service');
                expect(response.body.name).toBe('Multi-Step Service');
                expect(response.body.description).toBe(
                    'Service with multi-step authentication'
                );
                expect(response.body.authType).toBe('form');
                expect(response.body.isMultiStep).toBe(true);
                expect(response.body.stepCount).toBe(3);
                expect(Array.isArray(response.body.capabilities)).toBe(true);
            });

            it('should return OAuth2 entity type correctly', async () => {
                const response = await request(app)
                    .get('/api/entities/types/salesforce')
                    .set('Authorization', 'Bearer valid-token')
                    .expect(200);

                expect(response.body.authType).toBe('oauth2');
                expect(response.body.isMultiStep).toBe(false);
                expect(response.body.capabilities).toContain('accounts');
            });

            it('should return API key entity type correctly', async () => {
                const response = await request(app)
                    .get('/api/entities/types/custom-api')
                    .set('Authorization', 'Bearer valid-token')
                    .expect(200);

                expect(response.body.authType).toBe('api-key');
                expect(response.body.isMultiStep).toBe(false);
            });

            it('should handle entity type names with special characters', async () => {
                // This test ensures URL encoding is handled correctly
                const response = await request(app)
                    .get('/api/entities/types/multi-step-service')
                    .set('Authorization', 'Bearer valid-token')
                    .expect(200);

                expect(response.body.type).toBe('multi-step-service');
            });
        });

        describe('Error Cases', () => {
            it('should return 401 when no authentication provided', async () => {
                const response = await request(app)
                    .get('/api/entities/types/hubspot')
                    .expect(401);

                expect(response.body).toHaveProperty('error');
            });

            it('should return 404 when entity type does not exist', async () => {
                const response = await request(app)
                    .get('/api/entities/types/nonexistent-service')
                    .set('Authorization', 'Bearer valid-token')
                    .expect(404);

                expect(response.body).toHaveProperty('error');
                expect(response.body.message).toContain('not found');
            });

            it('should return list endpoint for trailing slash (Express normalizes path)', async () => {
                // Express treats /api/entities/types/ the same as /api/entities/types
                // This is standard Express behavior - trailing slashes don't create a new route
                const response = await request(app)
                    .get('/api/entities/types/')
                    .set('Authorization', 'Bearer valid-token')
                    .expect(200);

                // Returns the list endpoint
                expect(response.body).toHaveProperty('types');
            });

            it('should return 400 for invalid type name format', async () => {
                const response = await request(app)
                    .get('/api/entities/types/invalid@type!')
                    .set('Authorization', 'Bearer valid-token')
                    .expect(400);

                expect(response.body).toHaveProperty('error');
            });
        });
    });

    // =========================================================================
    // GET /api/entities/types/:typeName/requirements - Get auth requirements
    // =========================================================================

    describe('GET /api/entities/types/:typeName/requirements', () => {
        describe('Success Cases - Single-Step OAuth2', () => {
            it('should return OAuth2 requirements for single-step flow', async () => {
                const response = await request(app)
                    .get('/api/entities/types/hubspot/requirements')
                    .set('Authorization', 'Bearer valid-token')
                    .expect(200);

                // Validate against getEntityTypeRequirementsResponse schema
                expect(response.body.type).toBe('oauth2');
                expect(response.body.step).toBe(1);
                expect(response.body.totalSteps).toBe(1);
                expect(response.body.isMultiStep).toBe(false);
                expect(response.body.data).toHaveProperty('url');
                expect(response.body.data.url).toContain('hubspot.com');
            });

            it('should include scopes for OAuth2 requirements', async () => {
                const response = await request(app)
                    .get('/api/entities/types/hubspot/requirements')
                    .set('Authorization', 'Bearer valid-token')
                    .expect(200);

                expect(response.body.data).toHaveProperty('scopes');
                expect(Array.isArray(response.body.data.scopes)).toBe(true);
                expect(response.body.data.scopes.length).toBeGreaterThan(0);
            });

            it('should not include sessionId for single-step flow', async () => {
                const response = await request(app)
                    .get('/api/entities/types/hubspot/requirements')
                    .set('Authorization', 'Bearer valid-token')
                    .expect(200);

                expect(response.body.sessionId).toBeUndefined();
            });
        });

        describe('Success Cases - API Key', () => {
            it('should return API key requirements', async () => {
                const response = await request(app)
                    .get('/api/entities/types/custom-api/requirements')
                    .set('Authorization', 'Bearer valid-token')
                    .expect(200);

                expect(response.body.type).toBe('api-key');
                expect(response.body.step).toBe(1);
                expect(response.body.totalSteps).toBe(1);
                expect(response.body.isMultiStep).toBe(false);
                expect(response.body.data).toHaveProperty('fields');
                expect(Array.isArray(response.body.data.fields)).toBe(true);
            });

            it('should include field definitions for API key auth', async () => {
                const response = await request(app)
                    .get('/api/entities/types/custom-api/requirements')
                    .set('Authorization', 'Bearer valid-token')
                    .expect(200);

                const fields = response.body.data.fields;
                const apiKeyField = fields.find((f) => f.name === 'api_key');

                expect(apiKeyField).toBeDefined();
                expect(apiKeyField.type).toBe('api_key');
                expect(apiKeyField.required).toBe(true);
            });
        });

        describe('Success Cases - Multi-Step Form', () => {
            it('should return first step requirements with sessionId', async () => {
                const response = await request(app)
                    .get('/api/entities/types/multi-step-service/requirements')
                    .set('Authorization', 'Bearer valid-token')
                    .expect(200);

                expect(response.body.type).toBe('form');
                expect(response.body.step).toBe(1);
                expect(response.body.totalSteps).toBe(3);
                expect(response.body.isMultiStep).toBe(true);
                expect(response.body.sessionId).toBeDefined();
                expect(typeof response.body.sessionId).toBe('string');
            });

            it('should return step 1 form schema', async () => {
                const response = await request(app)
                    .get('/api/entities/types/multi-step-service/requirements')
                    .query({ step: 1 })
                    .set('Authorization', 'Bearer valid-token')
                    .expect(200);

                expect(response.body.data).toHaveProperty('jsonSchema');
                expect(response.body.data.jsonSchema.title).toContain('Step 1');
                expect(response.body.data.jsonSchema.properties).toHaveProperty(
                    'email'
                );
            });

            it('should return step 2 requirements with sessionId', async () => {
                const sessionId = 'test-session-123';

                const response = await request(app)
                    .get('/api/entities/types/multi-step-service/requirements')
                    .query({ step: 2, sessionId })
                    .set('Authorization', 'Bearer valid-token')
                    .expect(200);

                expect(response.body.type).toBe('form');
                expect(response.body.step).toBe(2);
                expect(response.body.totalSteps).toBe(3);
                expect(response.body.isMultiStep).toBe(true);
                expect(response.body.sessionId).toBe(sessionId);
                expect(response.body.data.jsonSchema.title).toContain('Step 2');
            });

            it('should return step 3 requirements', async () => {
                const sessionId = 'test-session-123';

                const response = await request(app)
                    .get('/api/entities/types/multi-step-service/requirements')
                    .query({ step: 3, sessionId })
                    .set('Authorization', 'Bearer valid-token')
                    .expect(200);

                expect(response.body.step).toBe(3);
                expect(response.body.totalSteps).toBe(3);
                expect(response.body.data.jsonSchema.title).toContain('Step 3');
            });
        });

        describe('Error Cases', () => {
            it('should return 401 when no authentication provided', async () => {
                const response = await request(app)
                    .get('/api/entities/types/hubspot/requirements')
                    .expect(401);

                expect(response.body).toHaveProperty('error');
            });

            it('should return 404 when entity type does not exist', async () => {
                const response = await request(app)
                    .get('/api/entities/types/nonexistent/requirements')
                    .set('Authorization', 'Bearer valid-token')
                    .expect(404);

                expect(response.body).toHaveProperty('error');
            });

            it('should return 400 when step is invalid', async () => {
                const response = await request(app)
                    .get('/api/entities/types/hubspot/requirements')
                    .query({ step: 0 })
                    .set('Authorization', 'Bearer valid-token')
                    .expect(400);

                expect(response.body).toHaveProperty('error');
                expect(response.body.message).toContain('step');
            });

            it('should return 400 when step is greater than totalSteps', async () => {
                const response = await request(app)
                    .get('/api/entities/types/hubspot/requirements')
                    .query({ step: 5 })
                    .set('Authorization', 'Bearer valid-token')
                    .expect(400);

                expect(response.body).toHaveProperty('error');
            });

            it('should return 400 when sessionId missing for step > 1', async () => {
                const response = await request(app)
                    .get('/api/entities/types/multi-step-service/requirements')
                    .query({ step: 2 })
                    .set('Authorization', 'Bearer valid-token')
                    .expect(400);

                expect(response.body).toHaveProperty('error');
                expect(response.body.message).toContain('sessionId');
            });

            it('should return 400 when sessionId is empty string', async () => {
                // The requirements endpoint validates sessionId format (non-empty string)
                // It does NOT validate against a session store as it's stateless
                const response = await request(app)
                    .get('/api/entities/types/multi-step-service/requirements')
                    .query({ step: 2, sessionId: '   ' }) // Empty/whitespace sessionId
                    .set('Authorization', 'Bearer valid-token')
                    .expect(400);

                expect(response.body).toHaveProperty('error');
            });

            it('should return 400 for negative step number', async () => {
                const response = await request(app)
                    .get('/api/entities/types/hubspot/requirements')
                    .query({ step: -1 })
                    .set('Authorization', 'Bearer valid-token')
                    .expect(400);

                expect(response.body).toHaveProperty('error');
            });
        });
    });

    // =========================================================================
    // POST /api/entities/:id/reauthorize - Reauthorize specific entity
    // =========================================================================

    describe('POST /api/entities/:id/reauthorize', () => {
        let mockEntity;
        let mockCredential;

        beforeEach(() => {
            mockEntity = {
                id: 'entity-123',
                type: 'hubspot',
                userId: 'user-123',
                credentialId: 'credential-123',
                authIsValid: false,
            };

            mockCredential = {
                id: 'credential-123',
                userId: 'user-123',
                data: {
                    access_token: 'old-token',
                    refresh_token: 'old-refresh',
                },
            };

            mockModuleRepository.findById.mockResolvedValue(mockEntity);
            mockCredentialRepository.findById.mockResolvedValue(mockCredential);

            // Set up default mock for ProcessAuthorizationCallback
            mockProcessAuthorizationCallbackExecute.mockResolvedValue({
                credential_id: 'credential-123',
                entity_id: 'entity-123',
            });

            // Set up default mock for ProcessAuthorizationStep
            mockProcessAuthorizationStepExecute.mockResolvedValue({
                completed: false,
                nextStep: 2,
                totalSteps: 3,
                sessionId: 'session-123',
                requirements: { type: 'form', data: { jsonSchema: {} } },
                message: 'Continue to step 2',
            });

            // Set up default mock for StartAuthorizationSession
            mockStartAuthorizationSessionExecute.mockResolvedValue({
                sessionId: 'generated-session-123',
                type: 'multi-step-service',
                totalSteps: 3,
                currentStep: 1,
                userId: 'user-123',
            });
        });

        describe('Success Cases - Single-Step Reauthorization', () => {
            it('should successfully reauthorize entity with OAuth2 code', async () => {
                const newCredential = {
                    ...mockCredential,
                    data: {
                        access_token: 'new-token',
                        refresh_token: 'new-refresh',
                    },
                };
                mockCredentialRepository.update.mockResolvedValue(
                    newCredential
                );

                const updatedEntity = { ...mockEntity, authIsValid: true };
                mockModuleRepository.update.mockResolvedValue(updatedEntity);

                const response = await request(app)
                    .post('/api/entities/entity-123/reauthorize')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        data: {
                            code: 'oauth2-authorization-code',
                            redirect_uri: 'https://app.example.com/callback',
                        },
                    })
                    .expect(200);

                // Validate against reauthorizeEntitySuccess schema
                expect(response.body.success).toBe(true);
                expect(response.body.credential_id).toBe('credential-123');
                expect(response.body.entity_id).toBe('entity-123');
                expect(response.body.authIsValid).toBe(true);
            });

            it('should successfully reauthorize entity with API key', async () => {
                mockEntity.type = 'custom-api';
                mockModuleRepository.findById.mockResolvedValue(mockEntity);

                const newCredential = {
                    ...mockCredential,
                    data: {
                        api_key: 'new-api-key',
                        api_secret: 'new-secret',
                    },
                };
                mockCredentialRepository.update.mockResolvedValue(
                    newCredential
                );

                const updatedEntity = { ...mockEntity, authIsValid: true };
                mockModuleRepository.update.mockResolvedValue(updatedEntity);

                const response = await request(app)
                    .post('/api/entities/entity-123/reauthorize')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        data: {
                            api_key: 'new-api-key',
                            api_secret: 'new-secret',
                        },
                    })
                    .expect(200);

                expect(response.body.success).toBe(true);
                expect(response.body.authIsValid).toBe(true);
            });

            it('should call processAuthorizationCallback with authorization data', async () => {
                const updatedEntity = { ...mockEntity, authIsValid: true };
                mockModuleRepository.update.mockResolvedValue(updatedEntity);

                await request(app)
                    .post('/api/entities/entity-123/reauthorize')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        data: {
                            code: 'oauth2-code',
                        },
                    })
                    .expect(200);

                // Verify processAuthorizationCallback was called with correct params
                expect(
                    mockProcessAuthorizationCallbackExecute
                ).toHaveBeenCalledWith(
                    'user-123', // userId
                    'hubspot', // entity type
                    { code: 'oauth2-code' } // auth data
                );
            });

            it('should mark entity as authIsValid after successful reauth', async () => {
                const newCredential = {
                    ...mockCredential,
                    data: { access_token: 'new-token' },
                };
                mockCredentialRepository.update.mockResolvedValue(
                    newCredential
                );

                const updatedEntity = { ...mockEntity, authIsValid: true };
                mockModuleRepository.update.mockResolvedValue(updatedEntity);

                await request(app)
                    .post('/api/entities/entity-123/reauthorize')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        data: { code: 'oauth2-code' },
                    })
                    .expect(200);

                expect(mockModuleRepository.update).toHaveBeenCalledWith(
                    expect.objectContaining({
                        id: 'entity-123',
                        authIsValid: true,
                    })
                );
            });
        });

        describe('Success Cases - Multi-Step Reauthorization', () => {
            beforeEach(() => {
                mockEntity.type = 'multi-step-service';
                mockModuleRepository.findById.mockResolvedValue(mockEntity);
            });

            it('should return next step for multi-step flow', async () => {
                const response = await request(app)
                    .post('/api/entities/entity-123/reauthorize')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        data: { email: 'user@example.com' },
                        step: 1,
                        sessionId: 'session-123',
                    })
                    .expect(200);

                // Validate against reauthorizeEntityNextStep schema
                expect(response.body.step).toBe(2);
                expect(response.body.totalSteps).toBe(3);
                expect(response.body.sessionId).toBe('session-123');
                expect(response.body.requirements).toHaveProperty('type');
                expect(response.body.message).toBeDefined();
            });

            it('should complete on final step', async () => {
                // Mock processAuthorizationStep to return completed: true for final step
                mockProcessAuthorizationStepExecute.mockResolvedValueOnce({
                    completed: true,
                    authData: { access_token: 'final-token' },
                });

                const newCredential = {
                    ...mockCredential,
                    data: { access_token: 'final-token' },
                };
                mockCredentialRepository.update.mockResolvedValue(
                    newCredential
                );

                const updatedEntity = { ...mockEntity, authIsValid: true };
                mockModuleRepository.update.mockResolvedValue(updatedEntity);

                const response = await request(app)
                    .post('/api/entities/entity-123/reauthorize')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        data: { password: 'secure-password' },
                        step: 3,
                        sessionId: 'session-123',
                    })
                    .expect(200);

                // Final step should return success
                expect(response.body.success).toBe(true);
                expect(response.body.authIsValid).toBe(true);
            });

            it('should maintain session across steps', async () => {
                const sessionId = 'session-123';

                // Step 1 - returns the sessionId provided by the client
                mockProcessAuthorizationStepExecute.mockResolvedValueOnce({
                    completed: false,
                    nextStep: 2,
                    totalSteps: 3,
                    sessionId: sessionId,
                    requirements: { type: 'form', data: { jsonSchema: {} } },
                    message: 'Continue to step 2',
                });

                // Step 2 - also maintains the session
                mockProcessAuthorizationStepExecute.mockResolvedValueOnce({
                    completed: false,
                    nextStep: 3,
                    totalSteps: 3,
                    sessionId: sessionId,
                    requirements: { type: 'form', data: { jsonSchema: {} } },
                    message: 'Continue to step 3',
                });

                // Step 1
                const step1Response = await request(app)
                    .post('/api/entities/entity-123/reauthorize')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        data: { email: 'user@example.com' },
                        step: 1,
                        sessionId,
                    })
                    .expect(200);

                expect(step1Response.body.sessionId).toBe(sessionId);

                // Step 2
                const step2Response = await request(app)
                    .post('/api/entities/entity-123/reauthorize')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        data: { otp: '123456' },
                        step: 2,
                        sessionId,
                    })
                    .expect(200);

                expect(step2Response.body.sessionId).toBe(sessionId);
            });
        });

        describe('Error Cases', () => {
            it('should return 401 when no authentication provided', async () => {
                const response = await request(app)
                    .post('/api/entities/entity-123/reauthorize')
                    .send({ data: { code: 'test' } })
                    .expect(401);

                expect(response.body).toHaveProperty('error');
            });

            it('should return 404 when entity does not exist', async () => {
                mockModuleRepository.findById.mockResolvedValue(null);

                const response = await request(app)
                    .post('/api/entities/nonexistent/reauthorize')
                    .set('Authorization', 'Bearer valid-token')
                    .send({ data: { code: 'test' } })
                    .expect(404);

                expect(response.body).toHaveProperty('error');
            });

            it('should return 403 when entity does not belong to user', async () => {
                mockEntity.userId = 'different-user';
                mockModuleRepository.findById.mockResolvedValue(mockEntity);

                const response = await request(app)
                    .post('/api/entities/entity-123/reauthorize')
                    .set('Authorization', 'Bearer valid-token')
                    .send({ data: { code: 'test' } })
                    .expect(403);

                expect(response.body).toHaveProperty('error');
                expect(response.body.message).toContain('not authorized');
            });

            it('should return 400 when data is missing', async () => {
                const response = await request(app)
                    .post('/api/entities/entity-123/reauthorize')
                    .set('Authorization', 'Bearer valid-token')
                    .send({})
                    .expect(400);

                expect(response.body).toHaveProperty('error');
                expect(response.body.message).toContain('data');
            });

            it('should return 400 when data is not an object', async () => {
                const response = await request(app)
                    .post('/api/entities/entity-123/reauthorize')
                    .set('Authorization', 'Bearer valid-token')
                    .send({ data: 'invalid' })
                    .expect(400);

                expect(response.body).toHaveProperty('error');
            });

            it('should return 400 when sessionId missing for multi-step step > 1', async () => {
                mockEntity.type = 'multi-step-service';
                mockModuleRepository.findById.mockResolvedValue(mockEntity);

                const response = await request(app)
                    .post('/api/entities/entity-123/reauthorize')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        data: { otp: '123456' },
                        step: 2,
                    })
                    .expect(400);

                expect(response.body).toHaveProperty('error');
                expect(response.body.message).toContain('sessionId');
            });

            it('should return 400 when step is invalid', async () => {
                // Note: step: 0 is treated as falsy and defaults to 1
                // Use step: -1 to test invalid step validation
                const response = await request(app)
                    .post('/api/entities/entity-123/reauthorize')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        data: { code: 'test' },
                        step: -1,
                    })
                    .expect(400);

                expect(response.body).toHaveProperty('error');
            });

            it('should return 400 when step exceeds total steps', async () => {
                mockEntity.type = 'multi-step-service';
                mockModuleRepository.findById.mockResolvedValue(mockEntity);

                const response = await request(app)
                    .post('/api/entities/entity-123/reauthorize')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        data: { code: 'test' },
                        step: 5,
                        sessionId: 'session-123',
                    })
                    .expect(400);

                expect(response.body).toHaveProperty('error');
            });

            it('should return 400 when OAuth2 code is invalid', async () => {
                // Mock processAuthorizationCallback to throw error for invalid code
                mockProcessAuthorizationCallbackExecute.mockRejectedValueOnce(
                    new Error('Invalid authorization code')
                );

                const response = await request(app)
                    .post('/api/entities/entity-123/reauthorize')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        data: { code: 'invalid-code' },
                    })
                    .expect(400);

                expect(response.body).toHaveProperty('error');
            });

            it('should return 400 when database error occurs during credential update', async () => {
                // All errors in the reauthorize flow are wrapped as badRequest
                // by the router implementation to avoid exposing internal errors
                mockProcessAuthorizationCallbackExecute.mockRejectedValueOnce(
                    new Error('Database error')
                );

                const response = await request(app)
                    .post('/api/entities/entity-123/reauthorize')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        data: { code: 'valid-code' },
                    })
                    .expect(400);

                expect(response.body).toHaveProperty('error');
            });
        });
    });

    // =========================================================================
    // Schema Validation Tests
    // =========================================================================

    describe('JSON Schema Validation', () => {
        it('should match entityType schema structure', async () => {
            const response = await request(app)
                .get('/api/entities/types')
                .set('Authorization', 'Bearer valid-token')
                .expect(200);

            const entityType = response.body.types[0];

            // Required fields
            expect(entityType).toHaveProperty('type');
            expect(entityType).toHaveProperty('name');
            expect(typeof entityType.type).toBe('string');
            expect(typeof entityType.name).toBe('string');

            // Optional fields (if present)
            if (entityType.description) {
                expect(typeof entityType.description).toBe('string');
            }
            if (entityType.authType) {
                expect(['oauth2', 'form', 'api-key', 'basic']).toContain(
                    entityType.authType
                );
            }
            if (entityType.isMultiStep !== undefined) {
                expect(typeof entityType.isMultiStep).toBe('boolean');
            }
            if (entityType.stepCount !== undefined) {
                expect(typeof entityType.stepCount).toBe('number');
                expect(entityType.stepCount).toBeGreaterThanOrEqual(1);
            }
            if (entityType.capabilities) {
                expect(Array.isArray(entityType.capabilities)).toBe(true);
            }
        });

        it('should match getEntityTypeRequirementsResponse schema', async () => {
            const response = await request(app)
                .get('/api/entities/types/hubspot/requirements')
                .set('Authorization', 'Bearer valid-token')
                .expect(200);

            // Required fields
            expect(response.body).toHaveProperty('type');
            expect(response.body).toHaveProperty('step');
            expect(response.body).toHaveProperty('totalSteps');
            expect(response.body).toHaveProperty('isMultiStep');
            expect(['oauth2', 'form', 'api-key', 'basic']).toContain(
                response.body.type
            );
            expect(typeof response.body.step).toBe('number');
            expect(response.body.step).toBeGreaterThanOrEqual(1);
            expect(typeof response.body.totalSteps).toBe('number');
            expect(response.body.totalSteps).toBeGreaterThanOrEqual(1);
            expect(typeof response.body.isMultiStep).toBe('boolean');
        });

        it('should match reauthorizeEntitySuccess schema', async () => {
            // Set up mock entity and credential for this test
            const mockEntity = {
                id: 'entity-123',
                type: 'hubspot',
                userId: 'user-123',
                credentialId: 'credential-123',
                authIsValid: false,
            };
            const mockCredential = {
                id: 'credential-123',
                userId: 'user-123',
                data: { access_token: 'old-token' },
            };

            mockModuleRepository.findById.mockResolvedValue(mockEntity);
            mockCredentialRepository.findById.mockResolvedValue(mockCredential);

            // Set up mock for processAuthorizationCallback
            mockProcessAuthorizationCallbackExecute.mockResolvedValueOnce({
                credential_id: 'credential-123',
                entity_id: 'entity-123',
            });

            const updatedEntity = { ...mockEntity, authIsValid: true };
            mockModuleRepository.update.mockResolvedValue(updatedEntity);

            const response = await request(app)
                .post('/api/entities/entity-123/reauthorize')
                .set('Authorization', 'Bearer valid-token')
                .send({
                    data: { code: 'oauth2-code' },
                })
                .expect(200);

            // Required fields
            expect(response.body.success).toBe(true);
            expect(response.body).toHaveProperty('credential_id');
            expect(response.body).toHaveProperty('entity_id');
            expect(response.body.authIsValid).toBe(true);
            expect(typeof response.body.credential_id).toBe('string');
            expect(typeof response.body.entity_id).toBe('string');
        });
    });
});
