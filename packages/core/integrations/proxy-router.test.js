/**
 * @file Proxy Router Tests (TDD)
 * @description Test-Driven Development tests for new proxy endpoints
 *
 * These tests are written FIRST to drive the implementation of:
 * - POST /api/entities/:id/proxy - Proxy request through an entity's API connection
 * - POST /api/credentials/:id/proxy - Proxy request through a credential's API connection
 *
 * Tests follow TDD red-green-refactor cycle and validate against JSON schemas:
 * - packages/schemas/schemas/api-proxy.schema.json
 *
 * Schema Reference:
 * - proxyRequest: { method, path, query?, headers?, body? }
 * - proxyResponse: { success: true, status, headers?, data }
 * - proxyErrorResponse: { success: false, status, error: { code, message, details?, upstreamStatus? } }
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

jest.mock('../modules/repositories/module-repository-factory', () => ({
    createModuleRepository: jest.fn(),
}));

jest.mock('../modules/module-factory', () => ({
    ModuleFactory: jest.fn(),
}));

jest.mock('../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
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
    createModuleRepository,
} = require('../modules/repositories/module-repository-factory');
const { ModuleFactory } = require('../modules/module-factory');

describe('Proxy Router - TDD Tests', () => {
    let app;
    let mockUserRepository;
    let mockCredentialRepository;
    let mockModuleRepository;
    let mockIntegrationRepository;
    let mockModuleFactory;
    let mockUser;
    let mockApiRequester;
    let mockEntity;
    let mockCredential;

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
            getSessionToken: jest.fn().mockResolvedValue(mockUser),
            findIndividualUserById: jest.fn().mockResolvedValue(mockUser),
            findOrganizationUserById: jest.fn().mockResolvedValue(null),
            findByEmail: jest.fn().mockResolvedValue(mockUser),
        };

        // Mock credential repository
        mockCredentialRepository = {
            findById: jest.fn(),
            findByIdForUser: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
        };

        // Mock module repository
        mockModuleRepository = {
            findById: jest.fn(),
            findByIdForUser: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
        };

        // Mock integration repository
        mockIntegrationRepository = {
            findById: jest.fn(),
            findByIdForUser: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
        };

        // Mock API requester that will make upstream calls
        mockApiRequester = {
            request: jest.fn(),
            _get: jest.fn(),
            _post: jest.fn(),
            _put: jest.fn(),
            _patch: jest.fn(),
            _delete: jest.fn(),
            addAuthHeaders: jest.fn().mockResolvedValue({}),
        };

        // Mock entity (API connection)
        mockEntity = {
            id: 'entity-123',
            entityType: 'ACCOUNT',
            credential: 'credential-123',
            userId: 'user-123',
            externalId: 'ext-account-123',
            name: 'Test Account',
        };

        // Mock credential with API instance
        mockCredential = {
            id: 'credential-123',
            userId: 'user-123',
            type: 'test-module',
            status: 'AUTHORIZED',
            data: {
                access_token: 'test-access-token',
                refresh_token: 'test-refresh-token',
            },
        };

        // Mock module factory - create a mock that will be returned by the constructor
        mockModuleFactory = {
            getModuleInstance: jest.fn().mockResolvedValue({
                api: mockApiRequester,
            }),
        };

        // Setup mocks
        createUserRepository.mockReturnValue(mockUserRepository);
        createCredentialRepository.mockReturnValue(mockCredentialRepository);
        createModuleRepository.mockReturnValue(mockModuleRepository);
        createIntegrationRepository.mockReturnValue(mockIntegrationRepository);

        // Mock ModuleFactory constructor to return our mock instance
        ModuleFactory.mockImplementation(function () {
            return mockModuleFactory;
        });

        loadAppDefinition.mockReturnValue({
            integrations: [
                {
                    moduleName: 'test-module',
                    definition: {
                        Api: class MockApi {
                            constructor(credential) {
                                return mockApiRequester;
                            }
                        },
                    },
                },
            ],
            userConfig: {
                usePassword: true,
                primary: 'individual',
            },
        });

        // Create Express app with router
        app = express();
        app.use(express.json());

        // Mock authentication middleware
        app.use((req, res, next) => {
            if (req.headers.authorization === 'Bearer valid-token') {
                req.user = mockUser;
            }
            next();
        });

        const router = createIntegrationRouter();
        app.use(router);

        // Add Boom error handler (must be after routes)
        app.use((err, req, res, next) => {
            if (Boom.isBoom(err)) {
                const { statusCode, payload } = err.output;
                return res.status(statusCode).json({
                    success: false,
                    status: statusCode,
                    error: {
                        code: _getErrorCodeFromStatus(statusCode),
                        message: payload.message,
                        ...(err.data || {}),
                    },
                });
            }
            // Handle non-Boom errors
            res.status(500).json({
                success: false,
                status: 500,
                error: {
                    code: 'INTERNAL_ERROR',
                    message: err.message || 'Internal Server Error',
                },
            });
        });
    });

    // Helper function to map HTTP status to error code (matching router implementation)
    function _getErrorCodeFromStatus(status) {
        switch (status) {
            case 400:
                return 'INVALID_REQUEST';
            case 401:
                return 'INVALID_AUTH';
            case 403:
                return 'PERMISSION_DENIED';
            case 404:
                return 'NOT_FOUND';
            case 408:
                return 'TIMEOUT';
            case 429:
                return 'RATE_LIMITED';
            case 500:
                return 'UPSTREAM_ERROR';
            case 502:
                return 'NETWORK_ERROR';
            case 503:
                return 'SERVICE_UNAVAILABLE';
            default:
                return 'UNKNOWN_ERROR';
        }
    }

    describe('POST /api/entities/:id/proxy', () => {
        describe('Successful Proxy Requests', () => {
            beforeEach(() => {
                // Mock successful entity lookup
                mockModuleRepository.findByIdForUser.mockResolvedValue(
                    mockEntity
                );
                mockCredentialRepository.findById.mockResolvedValue(
                    mockCredential
                );
            });

            it('should proxy successful GET request to upstream API', async () => {
                // Arrange: Mock upstream API response
                const upstreamResponse = {
                    results: [
                        {
                            id: 'contact-1',
                            name: 'John Doe',
                            email: 'john@example.com',
                        },
                    ],
                    total: 1,
                };

                mockApiRequester.request = jest.fn().mockResolvedValue({
                    status: 200,
                    headers: {
                        'content-type': 'application/json',
                        'x-rate-limit-remaining': '998',
                    },
                    data: upstreamResponse,
                });

                // Act: Make proxy request
                const response = await request(app)
                    .post('/api/entities/entity-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        method: 'GET',
                        path: '/v3/contacts',
                        query: {
                            limit: '10',
                            archived: 'false',
                        },
                    });

                // Assert: Verify response format matches proxyResponse schema
                expect(response.status).toBe(200);
                expect(response.body).toEqual({
                    success: true,
                    status: 200,
                    headers: {
                        'content-type': 'application/json',
                        'x-rate-limit-remaining': '998',
                    },
                    data: upstreamResponse,
                });

                // Assert: Verify upstream request was made correctly
                expect(mockApiRequester.request).toHaveBeenCalledWith({
                    method: 'GET',
                    url: '/v3/contacts',
                    query: {
                        limit: '10',
                        archived: 'false',
                    },
                    headers: {},
                    body: undefined,
                });

                // Assert: Verify entity was loaded for the authenticated user
                expect(
                    mockModuleRepository.findByIdForUser
                ).toHaveBeenCalledWith('entity-123', 'user-123');
            });

            it('should proxy successful POST request with body', async () => {
                // Arrange: Mock upstream API response for contact creation
                const upstreamResponse = {
                    id: 'contact-456',
                    created_at: '2025-01-15T10:30:00Z',
                    status: 'active',
                    properties: {
                        email: 'contact@example.com',
                        firstname: 'John',
                        lastname: 'Doe',
                    },
                };

                mockApiRequester.request = jest.fn().mockResolvedValue({
                    status: 201,
                    headers: {
                        'content-type': 'application/json',
                        location: '/v3/contacts/contact-456',
                    },
                    data: upstreamResponse,
                });

                mockModuleRepository.findByIdForUser.mockResolvedValue(
                    mockEntity
                );

                // Act: Make proxy POST request
                const response = await request(app)
                    .post('/api/entities/entity-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        method: 'POST',
                        path: '/v3/contacts',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: {
                            properties: {
                                email: 'contact@example.com',
                                firstname: 'John',
                                lastname: 'Doe',
                            },
                        },
                    });

                // Assert: Success response with 201 status
                expect(response.status).toBe(200);
                expect(response.body).toEqual({
                    success: true,
                    status: 201,
                    headers: {
                        'content-type': 'application/json',
                        location: '/v3/contacts/contact-456',
                    },
                    data: upstreamResponse,
                });

                // Assert: Request was proxied with correct body
                expect(mockApiRequester.request).toHaveBeenCalledWith({
                    method: 'POST',
                    url: '/v3/contacts',
                    query: undefined,
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: {
                        properties: {
                            email: 'contact@example.com',
                            firstname: 'John',
                            lastname: 'Doe',
                        },
                    },
                });
            });

            it('should proxy successful PUT request', async () => {
                // Arrange
                const upstreamResponse = {
                    id: 'user-789',
                    status: 'active',
                    updated_at: '2025-01-15T11:00:00Z',
                };

                mockApiRequester.request = jest.fn().mockResolvedValue({
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                    data: upstreamResponse,
                });

                mockModuleRepository.findByIdForUser.mockResolvedValue(
                    mockEntity
                );

                // Act
                const response = await request(app)
                    .post('/api/entities/entity-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        method: 'PUT',
                        path: '/api/v1/users/user-789',
                        body: {
                            status: 'active',
                        },
                    });

                // Assert
                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
                expect(response.body.status).toBe(200);
                expect(response.body.data).toEqual(upstreamResponse);
            });

            it('should proxy successful PATCH request', async () => {
                // Arrange
                const upstreamResponse = {
                    id: 'record-123',
                    updated_fields: ['name', 'description'],
                };

                mockApiRequester.request = jest.fn().mockResolvedValue({
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                    data: upstreamResponse,
                });

                mockModuleRepository.findByIdForUser.mockResolvedValue(
                    mockEntity
                );

                // Act
                const response = await request(app)
                    .post('/api/entities/entity-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        method: 'PATCH',
                        path: '/api/records/record-123',
                        body: {
                            name: 'Updated Name',
                            description: 'Updated Description',
                        },
                    });

                // Assert
                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
                expect(response.body.data).toEqual(upstreamResponse);
            });

            it('should proxy successful DELETE request', async () => {
                // Arrange
                mockApiRequester.request = jest.fn().mockResolvedValue({
                    status: 204,
                    headers: {},
                    data: null,
                });

                mockModuleRepository.findByIdForUser.mockResolvedValue(
                    mockEntity
                );

                // Act
                const response = await request(app)
                    .post('/api/entities/entity-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        method: 'DELETE',
                        path: '/api/records/record-123',
                    });

                // Assert
                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
                expect(response.body.status).toBe(204);
                expect(response.body.data).toBe(null);
            });

            it('should return upstream response headers', async () => {
                // Arrange
                mockApiRequester.request = jest.fn().mockResolvedValue({
                    status: 200,
                    headers: {
                        'content-type': 'application/json',
                        'x-rate-limit-limit': '1000',
                        'x-rate-limit-remaining': '998',
                        'x-rate-limit-reset': '1642253400',
                        'x-request-id': 'req-abc-123',
                    },
                    data: { success: true },
                });

                mockModuleRepository.findByIdForUser.mockResolvedValue(
                    mockEntity
                );

                // Act
                const response = await request(app)
                    .post('/api/entities/entity-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        method: 'GET',
                        path: '/api/status',
                    });

                // Assert: All upstream headers should be returned
                expect(response.status).toBe(200);
                expect(response.body.headers).toEqual({
                    'content-type': 'application/json',
                    'x-rate-limit-limit': '1000',
                    'x-rate-limit-remaining': '998',
                    'x-rate-limit-reset': '1642253400',
                    'x-request-id': 'req-abc-123',
                });
            });

            it('should handle query parameters correctly', async () => {
                // Arrange
                mockApiRequester.request = jest.fn().mockResolvedValue({
                    status: 200,
                    headers: {},
                    data: { results: [] },
                });

                mockModuleRepository.findByIdForUser.mockResolvedValue(
                    mockEntity
                );

                // Act: Send request with various query parameter types
                const response = await request(app)
                    .post('/api/entities/entity-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        method: 'GET',
                        path: '/api/search',
                        query: {
                            q: 'test query',
                            limit: 50,
                            offset: 100,
                            active: true,
                            tags: ['tag1', 'tag2', 'tag3'],
                        },
                    });

                // Assert: Query params passed correctly
                expect(response.status).toBe(200);
                expect(mockApiRequester.request).toHaveBeenCalledWith({
                    method: 'GET',
                    url: '/api/search',
                    query: {
                        q: 'test query',
                        limit: 50,
                        offset: 100,
                        active: true,
                        tags: ['tag1', 'tag2', 'tag3'],
                    },
                    headers: {},
                    body: undefined,
                });
            });

            it('should pass custom headers through to upstream API', async () => {
                // Arrange
                mockApiRequester.request = jest.fn().mockResolvedValue({
                    status: 200,
                    headers: {},
                    data: { success: true },
                });

                mockModuleRepository.findByIdForUser.mockResolvedValue(
                    mockEntity
                );

                // Act: Send request with custom headers
                const response = await request(app)
                    .post('/api/entities/entity-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        method: 'POST',
                        path: '/api/data',
                        headers: {
                            'Content-Type': 'application/json',
                            'X-Custom-Header': 'custom-value',
                            'X-Request-Id': 'req-xyz-789',
                        },
                        body: { data: 'test' },
                    });

                // Assert: Custom headers included in upstream request
                expect(response.status).toBe(200);
                expect(mockApiRequester.request).toHaveBeenCalledWith({
                    method: 'POST',
                    url: '/api/data',
                    query: undefined,
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Custom-Header': 'custom-value',
                        'X-Request-Id': 'req-xyz-789',
                    },
                    body: { data: 'test' },
                });
            });

            it('should handle different body types - object', async () => {
                // Arrange
                mockApiRequester.request = jest.fn().mockResolvedValue({
                    status: 200,
                    headers: {},
                    data: { created: true },
                });

                mockModuleRepository.findByIdForUser.mockResolvedValue(
                    mockEntity
                );

                // Act
                const response = await request(app)
                    .post('/api/entities/entity-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        method: 'POST',
                        path: '/api/items',
                        body: {
                            name: 'Test Item',
                            properties: { color: 'blue', size: 'large' },
                        },
                    });

                // Assert
                expect(response.status).toBe(200);
                expect(mockApiRequester.request).toHaveBeenCalledWith(
                    expect.objectContaining({
                        body: {
                            name: 'Test Item',
                            properties: { color: 'blue', size: 'large' },
                        },
                    })
                );
            });

            it('should handle different body types - array', async () => {
                // Arrange
                mockApiRequester.request = jest.fn().mockResolvedValue({
                    status: 200,
                    headers: {},
                    data: { batch_created: 3 },
                });

                mockModuleRepository.findByIdForUser.mockResolvedValue(
                    mockEntity
                );

                // Act
                const response = await request(app)
                    .post('/api/entities/entity-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        method: 'POST',
                        path: '/api/batch',
                        body: [
                            { id: 1, name: 'Item 1' },
                            { id: 2, name: 'Item 2' },
                            { id: 3, name: 'Item 3' },
                        ],
                    });

                // Assert
                expect(response.status).toBe(200);
                expect(mockApiRequester.request).toHaveBeenCalledWith(
                    expect.objectContaining({
                        body: [
                            { id: 1, name: 'Item 1' },
                            { id: 2, name: 'Item 2' },
                            { id: 3, name: 'Item 3' },
                        ],
                    })
                );
            });

            it('should handle different body types - string', async () => {
                // Arrange
                mockApiRequester.request = jest.fn().mockResolvedValue({
                    status: 200,
                    headers: {},
                    data: { processed: true },
                });

                mockModuleRepository.findByIdForUser.mockResolvedValue(
                    mockEntity
                );

                // Act
                const response = await request(app)
                    .post('/api/entities/entity-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        method: 'POST',
                        path: '/api/text',
                        body: 'Plain text content for processing',
                    });

                // Assert
                expect(response.status).toBe(200);
                expect(mockApiRequester.request).toHaveBeenCalledWith(
                    expect.objectContaining({
                        body: 'Plain text content for processing',
                    })
                );
            });

            it('should handle different body types - null', async () => {
                // Arrange
                mockApiRequester.request = jest.fn().mockResolvedValue({
                    status: 200,
                    headers: {},
                    data: { success: true },
                });

                mockModuleRepository.findByIdForUser.mockResolvedValue(
                    mockEntity
                );

                // Act
                const response = await request(app)
                    .post('/api/entities/entity-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        method: 'POST',
                        path: '/api/action',
                        body: null,
                    });

                // Assert
                expect(response.status).toBe(200);
                expect(mockApiRequester.request).toHaveBeenCalledWith(
                    expect.objectContaining({
                        body: null,
                    })
                );
            });
        });

        describe('Authentication & Authorization', () => {
            it('should return 401 when user not authenticated', async () => {
                // Act: Request without authorization header
                const response = await request(app)
                    .post('/api/entities/entity-123/proxy')
                    .send({
                        method: 'GET',
                        path: '/api/test',
                    });

                // Assert
                expect(response.status).toBe(401);
                expect(response.body.success).toBe(false);
                expect(response.body.error).toMatchObject({
                    code: 'INVALID_AUTH',
                    // Message can be "No valid authentication provided" or similar
                    message: expect.any(String),
                });
            });

            it('should return 404 when entity not found', async () => {
                // Arrange: Entity doesn't exist
                mockModuleRepository.findByIdForUser.mockResolvedValue(null);

                // Act
                const response = await request(app)
                    .post('/api/entities/entity-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        method: 'GET',
                        path: '/api/test',
                    });

                // Assert
                expect(response.status).toBe(404);
                expect(response.body.success).toBe(false);
                expect(response.body.error).toMatchObject({
                    code: 'NOT_FOUND',
                    message: expect.stringContaining('Entity not found'),
                });
            });

            it('should return 403 when entity does not belong to user', async () => {
                // Arrange: Entity belongs to different user
                const otherUserEntity = {
                    ...mockEntity,
                    userId: 'other-user-456',
                };

                // Mock repository to return null (access denied pattern)
                mockModuleRepository.findByIdForUser.mockResolvedValue(null);

                // Act
                const response = await request(app)
                    .post('/api/entities/entity-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        method: 'GET',
                        path: '/api/test',
                    });

                // Assert
                expect(response.status).toBe(404); // Using 404 not 403 to prevent entity enumeration
                expect(response.body.success).toBe(false);
                expect(
                    mockModuleRepository.findByIdForUser
                ).toHaveBeenCalledWith('entity-123', 'user-123');
            });
        });

        describe('Request Validation', () => {
            beforeEach(() => {
                mockModuleRepository.findByIdForUser.mockResolvedValue(
                    mockEntity
                );
                mockCredentialRepository.findById.mockResolvedValue(
                    mockCredential
                );
            });

            it('should return 400 when method is missing', async () => {
                // Act: Request without method field
                const response = await request(app)
                    .post('/api/entities/entity-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        path: '/api/test',
                    });

                // Assert
                expect(response.status).toBe(400);
                expect(response.body.success).toBe(false);
                expect(response.body.error).toMatchObject({
                    code: 'INVALID_REQUEST',
                    message: expect.stringContaining('method'),
                });
            });

            it('should return 400 when method is invalid', async () => {
                // Act: Request with invalid HTTP method
                const response = await request(app)
                    .post('/api/entities/entity-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        method: 'INVALID',
                        path: '/api/test',
                    });

                // Assert
                expect(response.status).toBe(400);
                expect(response.body.success).toBe(false);
                expect(response.body.error).toMatchObject({
                    code: 'INVALID_REQUEST',
                    message: expect.stringContaining('method must be one of'),
                });
            });

            it('should return 400 when path is missing', async () => {
                // Act: Request without path field
                const response = await request(app)
                    .post('/api/entities/entity-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        method: 'GET',
                    });

                // Assert
                expect(response.status).toBe(400);
                expect(response.body.success).toBe(false);
                expect(response.body.error).toMatchObject({
                    code: 'INVALID_REQUEST',
                    message: expect.stringContaining('path'),
                });
            });

            it('should return 400 when path does not start with /', async () => {
                // Act: Request with invalid path format
                const response = await request(app)
                    .post('/api/entities/entity-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        method: 'GET',
                        path: 'api/test', // Missing leading slash
                    });

                // Assert
                expect(response.status).toBe(400);
                expect(response.body.success).toBe(false);
                expect(response.body.error).toMatchObject({
                    code: 'INVALID_REQUEST',
                    message: expect.stringContaining('path must start with /'),
                });
            });

            it('should return 400 when path is empty string', async () => {
                // Act
                const response = await request(app)
                    .post('/api/entities/entity-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        method: 'GET',
                        path: '',
                    });

                // Assert
                expect(response.status).toBe(400);
                expect(response.body.success).toBe(false);
                expect(response.body.error.code).toBe('INVALID_REQUEST');
            });

            it('should return 400 when query params have invalid types', async () => {
                // Act: Query params must be string/number/boolean/array per schema
                const response = await request(app)
                    .post('/api/entities/entity-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        method: 'GET',
                        path: '/api/test',
                        query: {
                            valid: 'string',
                            invalid: { nested: 'object' }, // Objects not allowed
                        },
                    });

                // Assert
                expect(response.status).toBe(400);
                expect(response.body.success).toBe(false);
                expect(response.body.error).toMatchObject({
                    code: 'INVALID_REQUEST',
                    message: expect.stringContaining('query parameter'),
                });
            });

            it('should return 400 when headers are not strings', async () => {
                // Act: Headers must be string values per schema
                const response = await request(app)
                    .post('/api/entities/entity-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        method: 'GET',
                        path: '/api/test',
                        headers: {
                            'X-Valid-Header': 'string-value',
                            'X-Invalid-Header': 12345, // Must be string
                        },
                    });

                // Assert
                expect(response.status).toBe(400);
                expect(response.body.success).toBe(false);
                expect(response.body.error.code).toBe('INVALID_REQUEST');
            });
        });

        describe('Upstream API Errors', () => {
            beforeEach(() => {
                mockModuleRepository.findByIdForUser.mockResolvedValue(
                    mockEntity
                );
                mockCredentialRepository.findById.mockResolvedValue(
                    mockCredential
                );
            });

            it('should return INVALID_AUTH when credentials are invalid (401)', async () => {
                // Arrange: Upstream API returns 401 authentication error
                const upstreamError = new Error('Unauthorized');
                upstreamError.response = {
                    status: 401,
                    headers: { 'content-type': 'application/json' },
                    data: {
                        category: 'INVALID_AUTHENTICATION',
                        message:
                            'The access token provided is invalid or has expired',
                    },
                };

                mockApiRequester.request = jest
                    .fn()
                    .mockRejectedValue(upstreamError);

                // Act
                const response = await request(app)
                    .post('/api/entities/entity-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        method: 'GET',
                        path: '/v3/contacts',
                    });

                // Assert: Returns proxyErrorResponse format
                expect(response.status).toBe(401);
                expect(response.body).toEqual({
                    success: false,
                    status: 401,
                    error: {
                        code: 'INVALID_AUTH',
                        message:
                            'Authentication credentials are invalid or expired',
                        details: {
                            category: 'INVALID_AUTHENTICATION',
                            message:
                                'The access token provided is invalid or has expired',
                        },
                        upstreamStatus: 401,
                    },
                });
            });

            it('should return EXPIRED_TOKEN when token expired (401 with specific message)', async () => {
                // Arrange: Upstream API indicates token expiration
                const upstreamError = new Error('Token expired');
                upstreamError.response = {
                    status: 401,
                    headers: {},
                    data: {
                        error: 'token_expired',
                        error_description: 'The access token has expired',
                    },
                };

                mockApiRequester.request = jest
                    .fn()
                    .mockRejectedValue(upstreamError);

                // Act
                const response = await request(app)
                    .post('/api/entities/entity-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        method: 'GET',
                        path: '/api/data',
                    });

                // Assert
                expect(response.status).toBe(401);
                expect(response.body).toEqual({
                    success: false,
                    status: 401,
                    error: {
                        code: 'EXPIRED_TOKEN',
                        message: 'Access token has expired',
                        details: {
                            error: 'token_expired',
                            error_description: 'The access token has expired',
                        },
                        upstreamStatus: 401,
                    },
                });
            });

            it('should return UPSTREAM_ERROR for 400 Bad Request', async () => {
                // Arrange
                const upstreamError = new Error('Bad Request');
                upstreamError.response = {
                    status: 400,
                    headers: {},
                    data: {
                        error: 'invalid_input',
                        message: 'Required field "email" is missing',
                        validation_errors: ['email: required'],
                    },
                };

                mockApiRequester.request = jest
                    .fn()
                    .mockRejectedValue(upstreamError);

                // Act
                const response = await request(app)
                    .post('/api/entities/entity-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        method: 'POST',
                        path: '/api/contacts',
                        body: { name: 'John Doe' },
                    });

                // Assert
                expect(response.status).toBe(400);
                expect(response.body).toEqual({
                    success: false,
                    status: 400,
                    error: {
                        code: 'UPSTREAM_ERROR',
                        message: 'Upstream API returned an error',
                        details: {
                            error: 'invalid_input',
                            message: 'Required field "email" is missing',
                            validation_errors: ['email: required'],
                        },
                        upstreamStatus: 400,
                    },
                });
            });

            it('should return PERMISSION_DENIED for 403 Forbidden', async () => {
                // Arrange
                const upstreamError = new Error('Forbidden');
                upstreamError.response = {
                    status: 403,
                    headers: {},
                    data: {
                        error: 'insufficient_permissions',
                        message:
                            'User does not have permission to access this resource',
                        required_scope: 'contacts:write',
                    },
                };

                mockApiRequester.request = jest
                    .fn()
                    .mockRejectedValue(upstreamError);

                // Act
                const response = await request(app)
                    .post('/api/entities/entity-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        method: 'DELETE',
                        path: '/api/contacts/123',
                    });

                // Assert
                expect(response.status).toBe(403);
                expect(response.body).toEqual({
                    success: false,
                    status: 403,
                    error: {
                        code: 'PERMISSION_DENIED',
                        message: 'Insufficient permissions for this operation',
                        details: {
                            error: 'insufficient_permissions',
                            message:
                                'User does not have permission to access this resource',
                            required_scope: 'contacts:write',
                        },
                        upstreamStatus: 403,
                    },
                });
            });

            it('should return NOT_FOUND for 404 from upstream', async () => {
                // Arrange
                const upstreamError = new Error('Not Found');
                upstreamError.response = {
                    status: 404,
                    headers: {},
                    data: {
                        error: 'resource_not_found',
                        message: 'Contact with ID 99999 does not exist',
                    },
                };

                mockApiRequester.request = jest
                    .fn()
                    .mockRejectedValue(upstreamError);

                // Act
                const response = await request(app)
                    .post('/api/entities/entity-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        method: 'GET',
                        path: '/api/contacts/99999',
                    });

                // Assert
                expect(response.status).toBe(404);
                expect(response.body).toEqual({
                    success: false,
                    status: 404,
                    error: {
                        code: 'NOT_FOUND',
                        message: 'Resource not found',
                        details: {
                            error: 'resource_not_found',
                            message: 'Contact with ID 99999 does not exist',
                        },
                        upstreamStatus: 404,
                    },
                });
            });

            it('should return RATE_LIMITED when upstream rate limits (429)', async () => {
                // Arrange
                const upstreamError = new Error('Rate Limited');
                upstreamError.response = {
                    status: 429,
                    headers: {
                        'x-rate-limit-reset': '1642253400',
                        'retry-after': '60',
                    },
                    data: {
                        error: 'rate_limit_exceeded',
                        message: 'Rate limit exceeded',
                        retry_after: 60,
                        limit: '100 requests per minute',
                    },
                };

                mockApiRequester.request = jest
                    .fn()
                    .mockRejectedValue(upstreamError);

                // Act
                const response = await request(app)
                    .post('/api/entities/entity-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        method: 'GET',
                        path: '/api/contacts',
                    });

                // Assert: Matches proxyErrorResponse schema
                expect(response.status).toBe(429);
                expect(response.body).toEqual({
                    success: false,
                    status: 429,
                    error: {
                        code: 'RATE_LIMITED',
                        message: 'Rate limit exceeded for this API',
                        details: {
                            error: 'rate_limit_exceeded',
                            message: 'Rate limit exceeded',
                            retry_after: 60,
                            limit: '100 requests per minute',
                        },
                        upstreamStatus: 429,
                    },
                });
            });

            it('should return UPSTREAM_ERROR for 500 Internal Server Error', async () => {
                // Arrange
                const upstreamError = new Error('Internal Server Error');
                upstreamError.response = {
                    status: 500,
                    headers: {},
                    data: {
                        error: 'internal_error',
                        message: 'An unexpected error occurred',
                        error_id: 'err-abc-123',
                    },
                };

                mockApiRequester.request = jest
                    .fn()
                    .mockRejectedValue(upstreamError);

                // Act
                const response = await request(app)
                    .post('/api/entities/entity-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        method: 'GET',
                        path: '/api/data',
                    });

                // Assert
                expect(response.status).toBe(500);
                expect(response.body).toEqual({
                    success: false,
                    status: 500,
                    error: {
                        code: 'UPSTREAM_ERROR',
                        message: 'Upstream API returned an error',
                        details: {
                            error: 'internal_error',
                            message: 'An unexpected error occurred',
                            error_id: 'err-abc-123',
                        },
                        upstreamStatus: 500,
                    },
                });
            });

            it('should return SERVICE_UNAVAILABLE for 503 from upstream', async () => {
                // Arrange
                const upstreamError = new Error('Service Unavailable');
                upstreamError.response = {
                    status: 503,
                    headers: {
                        'retry-after': '300',
                    },
                    data: {
                        error: 'service_unavailable',
                        message:
                            'Service temporarily unavailable for maintenance',
                    },
                };

                mockApiRequester.request = jest
                    .fn()
                    .mockRejectedValue(upstreamError);

                // Act
                const response = await request(app)
                    .post('/api/entities/entity-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        method: 'GET',
                        path: '/api/status',
                    });

                // Assert
                expect(response.status).toBe(503);
                expect(response.body).toEqual({
                    success: false,
                    status: 503,
                    error: {
                        code: 'SERVICE_UNAVAILABLE',
                        message: 'Upstream service is unavailable',
                        details: {
                            error: 'service_unavailable',
                            message:
                                'Service temporarily unavailable for maintenance',
                        },
                        upstreamStatus: 503,
                    },
                });
            });

            it('should return TIMEOUT when request times out', async () => {
                // Arrange: Simulate timeout error
                const timeoutError = new Error('Request timeout');
                timeoutError.code = 'ETIMEDOUT';
                timeoutError.type = 'request-timeout';

                mockApiRequester.request = jest
                    .fn()
                    .mockRejectedValue(timeoutError);

                // Act
                const response = await request(app)
                    .post('/api/entities/entity-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        method: 'GET',
                        path: '/api/slow-endpoint',
                    });

                // Assert
                expect(response.status).toBe(504);
                expect(response.body).toEqual({
                    success: false,
                    status: 504,
                    error: {
                        code: 'TIMEOUT',
                        message: 'Request to upstream API timed out',
                        details: null,
                    },
                });
            });

            it('should return NETWORK_ERROR for connection failures', async () => {
                // Arrange: Simulate network error
                const networkError = new Error(
                    'getaddrinfo ENOTFOUND api.example.com'
                );
                networkError.code = 'ENOTFOUND';
                networkError.type = 'system';

                mockApiRequester.request = jest
                    .fn()
                    .mockRejectedValue(networkError);

                // Act
                const response = await request(app)
                    .post('/api/entities/entity-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        method: 'GET',
                        path: '/api/test',
                    });

                // Assert
                expect(response.status).toBe(502);
                expect(response.body).toEqual({
                    success: false,
                    status: 502,
                    error: {
                        code: 'NETWORK_ERROR',
                        message: 'Failed to connect to upstream API',
                        details: expect.objectContaining({
                            error: 'getaddrinfo ENOTFOUND api.example.com',
                        }),
                    },
                });
            });

            it('should return 401 when credential is missing auth data', async () => {
                // Arrange: Credential exists but has no access token
                const invalidCredential = {
                    ...mockCredential,
                    data: {}, // Missing access_token
                };

                mockCredentialRepository.findById.mockResolvedValue(
                    invalidCredential
                );

                // Act
                const response = await request(app)
                    .post('/api/entities/entity-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        method: 'GET',
                        path: '/api/test',
                    });

                // Assert: Returns 401 with INVALID_AUTH code (router maps from 401 status)
                // Note: The use case throws Boom.unauthorized which results in INVALID_AUTH
                expect(response.status).toBe(401);
                expect(response.body.success).toBe(false);
                expect(response.body.error.code).toBe('INVALID_AUTH');
                expect(response.body.error.message).toContain(
                    'missing required authentication data'
                );
            });

            it('should return 401 when credential status is not AUTHORIZED', async () => {
                // Arrange: Credential exists but is revoked
                const revokedCredential = {
                    ...mockCredential,
                    status: 'REVOKED',
                };

                mockCredentialRepository.findById.mockResolvedValue(
                    revokedCredential
                );

                // Act
                const response = await request(app)
                    .post('/api/entities/entity-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        method: 'GET',
                        path: '/api/test',
                    });

                // Assert: Returns 401 with INVALID_AUTH code (router maps from 401 status)
                expect(response.status).toBe(401);
                expect(response.body.error.code).toBe('INVALID_AUTH');
                expect(response.body.error.message).toContain('not authorized');
            });
        });

        describe('Edge Cases', () => {
            beforeEach(() => {
                mockModuleRepository.findByIdForUser.mockResolvedValue(
                    mockEntity
                );
                mockCredentialRepository.findById.mockResolvedValue(
                    mockCredential
                );
            });

            it('should handle response with no headers', async () => {
                // Arrange
                mockApiRequester.request = jest.fn().mockResolvedValue({
                    status: 200,
                    headers: null, // Some APIs might return null headers
                    data: { success: true },
                });

                // Act
                const response = await request(app)
                    .post('/api/entities/entity-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        method: 'GET',
                        path: '/api/test',
                    });

                // Assert: Should handle gracefully
                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
                expect(response.body.headers).toBeDefined(); // Should be empty object or null
            });

            it('should handle response with no body (204 No Content)', async () => {
                // Arrange
                mockApiRequester.request = jest.fn().mockResolvedValue({
                    status: 204,
                    headers: {},
                    data: null,
                });

                // Act
                const response = await request(app)
                    .post('/api/entities/entity-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        method: 'DELETE',
                        path: '/api/records/123',
                    });

                // Assert
                expect(response.status).toBe(200);
                expect(response.body).toEqual({
                    success: true,
                    status: 204,
                    headers: {},
                    data: null,
                });
            });

            it('should handle entity with null credential reference', async () => {
                // Arrange: Entity exists but has no credential
                const entityWithoutCredential = {
                    ...mockEntity,
                    credential: null,
                };

                mockModuleRepository.findByIdForUser.mockResolvedValue(
                    entityWithoutCredential
                );

                // Act
                const response = await request(app)
                    .post('/api/entities/entity-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        method: 'GET',
                        path: '/api/test',
                    });

                // Assert: Returns 400 INVALID_REQUEST when entity has no credential
                expect(response.status).toBe(400);
                expect(response.body.error.code).toBe('INVALID_REQUEST');
                expect(response.body.error.message).toContain('credential');
            });

            it('should handle credential that cannot be loaded', async () => {
                // Arrange: Entity references credential that doesn't exist
                mockModuleRepository.findByIdForUser.mockResolvedValue(
                    mockEntity
                );
                mockCredentialRepository.findById.mockResolvedValue(null);

                // Act
                const response = await request(app)
                    .post('/api/entities/entity-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        method: 'GET',
                        path: '/api/test',
                    });

                // Assert
                expect(response.status).toBe(404);
                expect(response.body.error.code).toBe('NOT_FOUND');
                expect(response.body.error.message).toContain(
                    'Credential not found'
                );
            });

            it('should handle query parameter with special characters', async () => {
                // Arrange
                mockApiRequester.request = jest.fn().mockResolvedValue({
                    status: 200,
                    headers: {},
                    data: { results: [] },
                });

                // Act
                const response = await request(app)
                    .post('/api/entities/entity-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        method: 'GET',
                        path: '/api/search',
                        query: {
                            q: 'test@example.com',
                            filter: 'status=active&type=contact',
                            'special-chars': '!@#$%^&*()',
                        },
                    });

                // Assert: Should pass through correctly
                expect(response.status).toBe(200);
                expect(mockApiRequester.request).toHaveBeenCalledWith(
                    expect.objectContaining({
                        query: {
                            q: 'test@example.com',
                            filter: 'status=active&type=contact',
                            'special-chars': '!@#$%^&*()',
                        },
                    })
                );
            });

            it('should handle very large response data', async () => {
                // Arrange: Simulate large dataset response
                const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
                    id: `item-${i}`,
                    name: `Item ${i}`,
                    data: 'x'.repeat(100),
                }));

                mockApiRequester.request = jest.fn().mockResolvedValue({
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                    data: { results: largeDataset },
                });

                // Act
                const response = await request(app)
                    .post('/api/entities/entity-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        method: 'GET',
                        path: '/api/items',
                    });

                // Assert: Should return all data
                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
                expect(response.body.data.results.length).toBe(1000);
            });
        });
    });

    describe('POST /api/credentials/:id/proxy', () => {
        describe('Successful Proxy Requests', () => {
            beforeEach(() => {
                // Mock successful credential lookup
                mockCredentialRepository.findByIdForUser.mockResolvedValue(
                    mockCredential
                );
            });

            it('should proxy GET request through credential directly', async () => {
                // Arrange
                const upstreamResponse = {
                    data: [{ id: 'record-1', name: 'Record 1' }],
                };

                mockApiRequester.request = jest.fn().mockResolvedValue({
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                    data: upstreamResponse,
                });

                // Act: Proxy through credential (no entity required)
                const response = await request(app)
                    .post('/api/credentials/credential-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        method: 'GET',
                        path: '/api/records',
                    });

                // Assert
                expect(response.status).toBe(200);
                expect(response.body).toEqual({
                    success: true,
                    status: 200,
                    headers: { 'content-type': 'application/json' },
                    data: upstreamResponse,
                });

                // Assert: Credential was loaded for authenticated user
                expect(
                    mockCredentialRepository.findByIdForUser
                ).toHaveBeenCalledWith('credential-123', 'user-123');
            });

            it('should proxy POST request with body through credential', async () => {
                // Arrange
                const requestBody = {
                    name: 'New Record',
                    description: 'Test record',
                };

                const upstreamResponse = {
                    id: 'record-new',
                    ...requestBody,
                    created_at: '2025-01-15T12:00:00Z',
                };

                mockApiRequester.request = jest.fn().mockResolvedValue({
                    status: 201,
                    headers: {},
                    data: upstreamResponse,
                });

                mockCredentialRepository.findByIdForUser.mockResolvedValue(
                    mockCredential
                );

                // Act
                const response = await request(app)
                    .post('/api/credentials/credential-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        method: 'POST',
                        path: '/api/records',
                        body: requestBody,
                    });

                // Assert
                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
                expect(response.body.status).toBe(201);
                expect(response.body.data).toEqual(upstreamResponse);
            });

            it('should work without an entity (direct credential access)', async () => {
                // Arrange: Credential not linked to any entity
                const standaloneCredential = {
                    ...mockCredential,
                    // No entity association
                };

                mockCredentialRepository.findByIdForUser.mockResolvedValue(
                    standaloneCredential
                );

                mockApiRequester.request = jest.fn().mockResolvedValue({
                    status: 200,
                    headers: {},
                    data: { success: true },
                });

                // Act
                const response = await request(app)
                    .post('/api/credentials/credential-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        method: 'GET',
                        path: '/api/test',
                    });

                // Assert: Should work without entity
                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
                expect(
                    mockCredentialRepository.findByIdForUser
                ).toHaveBeenCalledWith('credential-123', 'user-123');
            });

            it('should pass query parameters and custom headers', async () => {
                // Arrange
                mockApiRequester.request = jest.fn().mockResolvedValue({
                    status: 200,
                    headers: {},
                    data: { results: [] },
                });

                mockCredentialRepository.findByIdForUser.mockResolvedValue(
                    mockCredential
                );

                // Act
                const response = await request(app)
                    .post('/api/credentials/credential-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        method: 'GET',
                        path: '/api/items',
                        query: {
                            page: 1,
                            per_page: 25,
                            sort: 'created_at',
                        },
                        headers: {
                            'X-Custom-Header': 'test-value',
                        },
                    });

                // Assert
                expect(response.status).toBe(200);
                expect(mockApiRequester.request).toHaveBeenCalledWith({
                    method: 'GET',
                    url: '/api/items',
                    query: {
                        page: 1,
                        per_page: 25,
                        sort: 'created_at',
                    },
                    headers: {
                        'X-Custom-Header': 'test-value',
                    },
                    body: undefined,
                });
            });
        });

        describe('Authentication & Authorization', () => {
            it('should return 401 when user not authenticated', async () => {
                // Act: Request without authorization
                const response = await request(app)
                    .post('/api/credentials/credential-123/proxy')
                    .send({
                        method: 'GET',
                        path: '/api/test',
                    });

                // Assert
                expect(response.status).toBe(401);
                expect(response.body.success).toBe(false);
                expect(response.body.error.code).toBe('INVALID_AUTH');
            });

            it('should return 404 when credential not found', async () => {
                // Arrange: Credential doesn't exist
                mockCredentialRepository.findByIdForUser.mockResolvedValue(
                    null
                );

                // Act
                const response = await request(app)
                    .post('/api/credentials/credential-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        method: 'GET',
                        path: '/api/test',
                    });

                // Assert
                expect(response.status).toBe(404);
                expect(response.body).toEqual({
                    success: false,
                    status: 404,
                    error: {
                        code: 'NOT_FOUND',
                        message: 'Credential not found',
                        details: null,
                    },
                });
            });

            it('should return 403 when credential does not belong to user', async () => {
                // Arrange: Repository returns null for access control
                mockCredentialRepository.findByIdForUser.mockResolvedValue(
                    null
                );

                // Act
                const response = await request(app)
                    .post('/api/credentials/credential-456/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        method: 'GET',
                        path: '/api/test',
                    });

                // Assert: Using 404 to prevent credential enumeration
                expect(response.status).toBe(404);
                expect(response.body.error.code).toBe('NOT_FOUND');

                // Assert: Verify access control check was performed
                expect(
                    mockCredentialRepository.findByIdForUser
                ).toHaveBeenCalledWith('credential-456', 'user-123');
            });
        });

        describe('Request Validation', () => {
            beforeEach(() => {
                mockCredentialRepository.findByIdForUser.mockResolvedValue(
                    mockCredential
                );
            });

            it('should return 400 when method is missing', async () => {
                // Act
                const response = await request(app)
                    .post('/api/credentials/credential-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        path: '/api/test',
                    });

                // Assert
                expect(response.status).toBe(400);
                expect(response.body.error.code).toBe('INVALID_REQUEST');
                expect(response.body.error.message).toContain('method');
            });

            it('should return 400 when path is missing', async () => {
                // Act
                const response = await request(app)
                    .post('/api/credentials/credential-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        method: 'GET',
                    });

                // Assert
                expect(response.status).toBe(400);
                expect(response.body.error.code).toBe('INVALID_REQUEST');
                expect(response.body.error.message).toContain('path');
            });

            it('should return 400 when method is invalid', async () => {
                // Act
                const response = await request(app)
                    .post('/api/credentials/credential-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        method: 'TRACE', // Not in allowed enum
                        path: '/api/test',
                    });

                // Assert
                expect(response.status).toBe(400);
                expect(response.body.error.code).toBe('INVALID_REQUEST');
            });

            it('should return 400 when path does not start with /', async () => {
                // Act
                const response = await request(app)
                    .post('/api/credentials/credential-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        method: 'GET',
                        path: 'api/test', // Missing leading slash
                    });

                // Assert
                expect(response.status).toBe(400);
                expect(response.body.error.code).toBe('INVALID_REQUEST');
                expect(response.body.error.message).toContain(
                    'path must start with /'
                );
            });
        });

        describe('Upstream API Errors', () => {
            beforeEach(() => {
                mockCredentialRepository.findByIdForUser.mockResolvedValue(
                    mockCredential
                );
            });

            it('should return INVALID_AUTH for 401 from upstream', async () => {
                // Arrange
                const upstreamError = new Error('Unauthorized');
                upstreamError.response = {
                    status: 401,
                    headers: {},
                    data: { error: 'invalid_token' },
                };

                mockApiRequester.request = jest
                    .fn()
                    .mockRejectedValue(upstreamError);

                // Act
                const response = await request(app)
                    .post('/api/credentials/credential-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        method: 'GET',
                        path: '/api/protected',
                    });

                // Assert
                expect(response.status).toBe(401);
                expect(response.body.error.code).toBe('INVALID_AUTH');
                expect(response.body.error.upstreamStatus).toBe(401);
            });

            it('should return RATE_LIMITED for 429 from upstream', async () => {
                // Arrange
                const upstreamError = new Error('Rate Limited');
                upstreamError.response = {
                    status: 429,
                    headers: { 'retry-after': '120' },
                    data: {
                        error: 'rate_limit_exceeded',
                        retry_after: 120,
                    },
                };

                mockApiRequester.request = jest
                    .fn()
                    .mockRejectedValue(upstreamError);

                // Act
                const response = await request(app)
                    .post('/api/credentials/credential-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        method: 'GET',
                        path: '/api/data',
                    });

                // Assert
                expect(response.status).toBe(429);
                expect(response.body.error.code).toBe('RATE_LIMITED');
                expect(response.body.error.upstreamStatus).toBe(429);
            });

            it('should return TIMEOUT for timeout errors', async () => {
                // Arrange
                const timeoutError = new Error('Timeout');
                timeoutError.code = 'ETIMEDOUT';

                mockApiRequester.request = jest
                    .fn()
                    .mockRejectedValue(timeoutError);

                // Act
                const response = await request(app)
                    .post('/api/credentials/credential-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        method: 'GET',
                        path: '/api/slow',
                    });

                // Assert
                expect(response.status).toBe(504);
                expect(response.body.error.code).toBe('TIMEOUT');
            });
        });
    });

    describe('Common Behavior Between Entity and Credential Proxies', () => {
        beforeEach(() => {
            mockModuleRepository.findByIdForUser.mockResolvedValue(mockEntity);
            mockCredentialRepository.findById.mockResolvedValue(mockCredential);
            mockCredentialRepository.findByIdForUser.mockResolvedValue(
                mockCredential
            );
        });

        it('should sanitize sensitive headers from upstream response', async () => {
            // Arrange: Upstream returns sensitive headers
            mockApiRequester.request = jest.fn().mockResolvedValue({
                status: 200,
                headers: {
                    'content-type': 'application/json',
                    authorization: 'Bearer secret-token', // Should be sanitized
                    'x-api-key': 'secret-key', // Should be sanitized
                    'set-cookie': 'session=abc123', // Should be sanitized
                    'x-custom-header': 'safe-value', // Should be kept
                },
                data: { success: true },
            });

            // Act: Test both endpoints
            const entityResponse = await request(app)
                .post('/api/entities/entity-123/proxy')
                .set('Authorization', 'Bearer valid-token')
                .send({ method: 'GET', path: '/api/test' });

            const credentialResponse = await request(app)
                .post('/api/credentials/credential-123/proxy')
                .set('Authorization', 'Bearer valid-token')
                .send({ method: 'GET', path: '/api/test' });

            // Assert: Sensitive headers removed from both
            const expectedHeaders = {
                'content-type': 'application/json',
                'x-custom-header': 'safe-value',
            };

            expect(entityResponse.body.headers).toEqual(expectedHeaders);
            expect(credentialResponse.body.headers).toEqual(expectedHeaders);
        });

        it('should handle upstream API with no error details', async () => {
            // Arrange: Generic error with minimal info
            const upstreamError = new Error('Request failed');
            upstreamError.response = {
                status: 500,
                headers: {},
                data: null, // No error body
            };

            mockApiRequester.request = jest
                .fn()
                .mockRejectedValue(upstreamError);

            // Act: Test both endpoints
            const entityResponse = await request(app)
                .post('/api/entities/entity-123/proxy')
                .set('Authorization', 'Bearer valid-token')
                .send({ method: 'GET', path: '/api/test' });

            const credentialResponse = await request(app)
                .post('/api/credentials/credential-123/proxy')
                .set('Authorization', 'Bearer valid-token')
                .send({ method: 'GET', path: '/api/test' });

            // Assert: Should handle gracefully
            expect(entityResponse.status).toBe(500);
            expect(entityResponse.body.error.code).toBe('UPSTREAM_ERROR');
            expect(entityResponse.body.error.details).toBeDefined();

            expect(credentialResponse.status).toBe(500);
            expect(credentialResponse.body.error.code).toBe('UPSTREAM_ERROR');
        });

        it('should preserve all HTTP methods from schema', async () => {
            // Arrange
            const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

            mockApiRequester.request = jest.fn().mockResolvedValue({
                status: 200,
                headers: {},
                data: { success: true },
            });

            // Act & Assert: All methods should be supported
            for (const method of methods) {
                const response = await request(app)
                    .post('/api/entities/entity-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({
                        method,
                        path: '/api/test',
                        body: ['POST', 'PUT', 'PATCH'].includes(method)
                            ? { test: 'data' }
                            : undefined,
                    });

                expect(response.status).toBe(200);
                expect(response.body.success).toBe(true);
                expect(mockApiRequester.request).toHaveBeenCalledWith(
                    expect.objectContaining({ method })
                );
            }
        });

        it('should handle response data types - object', async () => {
            // Arrange
            mockApiRequester.request = jest.fn().mockResolvedValue({
                status: 200,
                headers: {},
                data: { id: '123', name: 'Test', nested: { key: 'value' } },
            });

            // Act
            const response = await request(app)
                .post('/api/entities/entity-123/proxy')
                .set('Authorization', 'Bearer valid-token')
                .send({ method: 'GET', path: '/api/test' });

            // Assert
            expect(response.body.data).toEqual({
                id: '123',
                name: 'Test',
                nested: { key: 'value' },
            });
        });

        it('should handle response data types - array', async () => {
            // Arrange
            mockApiRequester.request = jest.fn().mockResolvedValue({
                status: 200,
                headers: {},
                data: [{ id: 1 }, { id: 2 }, { id: 3 }],
            });

            // Act
            const response = await request(app)
                .post('/api/entities/entity-123/proxy')
                .set('Authorization', 'Bearer valid-token')
                .send({ method: 'GET', path: '/api/items' });

            // Assert
            expect(response.body.data).toEqual([
                { id: 1 },
                { id: 2 },
                { id: 3 },
            ]);
        });

        it('should handle response data types - string', async () => {
            // Arrange
            mockApiRequester.request = jest.fn().mockResolvedValue({
                status: 200,
                headers: { 'content-type': 'text/plain' },
                data: 'Plain text response',
            });

            // Act
            const response = await request(app)
                .post('/api/entities/entity-123/proxy')
                .set('Authorization', 'Bearer valid-token')
                .send({ method: 'GET', path: '/api/text' });

            // Assert
            expect(response.body.data).toBe('Plain text response');
        });

        it('should handle response data types - number', async () => {
            // Arrange
            mockApiRequester.request = jest.fn().mockResolvedValue({
                status: 200,
                headers: {},
                data: 42,
            });

            // Act
            const response = await request(app)
                .post('/api/entities/entity-123/proxy')
                .set('Authorization', 'Bearer valid-token')
                .send({ method: 'GET', path: '/api/count' });

            // Assert
            expect(response.body.data).toBe(42);
        });

        it('should handle response data types - boolean', async () => {
            // Arrange
            mockApiRequester.request = jest.fn().mockResolvedValue({
                status: 200,
                headers: {},
                data: true,
            });

            // Act
            const response = await request(app)
                .post('/api/entities/entity-123/proxy')
                .set('Authorization', 'Bearer valid-token')
                .send({ method: 'GET', path: '/api/status' });

            // Assert
            expect(response.body.data).toBe(true);
        });

        it('should handle response data types - null', async () => {
            // Arrange
            mockApiRequester.request = jest.fn().mockResolvedValue({
                status: 204,
                headers: {},
                data: null,
            });

            // Act
            const response = await request(app)
                .post('/api/entities/entity-123/proxy')
                .set('Authorization', 'Bearer valid-token')
                .send({ method: 'DELETE', path: '/api/items/123' });

            // Assert
            expect(response.body.data).toBe(null);
        });
    });

    describe('Error Code Mapping', () => {
        beforeEach(() => {
            mockModuleRepository.findByIdForUser.mockResolvedValue(mockEntity);
            mockCredentialRepository.findById.mockResolvedValue(mockCredential);
        });

        it('should map 400 errors to UPSTREAM_ERROR', async () => {
            const upstreamError = new Error('Bad Request');
            upstreamError.response = {
                status: 400,
                headers: {},
                data: { error: 'validation_failed' },
            };

            mockApiRequester.request = jest
                .fn()
                .mockRejectedValue(upstreamError);

            const response = await request(app)
                .post('/api/entities/entity-123/proxy')
                .set('Authorization', 'Bearer valid-token')
                .send({ method: 'POST', path: '/api/test', body: {} });

            expect(response.status).toBe(400);
            expect(response.body.error.code).toBe('UPSTREAM_ERROR');
            expect(response.body.error.upstreamStatus).toBe(400);
        });

        it('should map 401 errors to INVALID_AUTH or EXPIRED_TOKEN', async () => {
            // Test INVALID_AUTH
            const authError = new Error('Unauthorized');
            authError.response = {
                status: 401,
                data: { error: 'invalid_token' },
            };

            mockApiRequester.request = jest.fn().mockRejectedValue(authError);

            const response = await request(app)
                .post('/api/entities/entity-123/proxy')
                .set('Authorization', 'Bearer valid-token')
                .send({ method: 'GET', path: '/api/test' });

            expect(response.status).toBe(401);
            expect(['INVALID_AUTH', 'EXPIRED_TOKEN']).toContain(
                response.body.error.code
            );
        });

        it('should map 403 errors to PERMISSION_DENIED', async () => {
            const forbiddenError = new Error('Forbidden');
            forbiddenError.response = {
                status: 403,
                data: { error: 'access_denied' },
            };

            mockApiRequester.request = jest
                .fn()
                .mockRejectedValue(forbiddenError);

            const response = await request(app)
                .post('/api/entities/entity-123/proxy')
                .set('Authorization', 'Bearer valid-token')
                .send({ method: 'GET', path: '/api/admin' });

            expect(response.status).toBe(403);
            expect(response.body.error.code).toBe('PERMISSION_DENIED');
        });

        it('should map 404 errors to NOT_FOUND', async () => {
            const notFoundError = new Error('Not Found');
            notFoundError.response = {
                status: 404,
                data: { error: 'resource_not_found' },
            };

            mockApiRequester.request = jest
                .fn()
                .mockRejectedValue(notFoundError);

            const response = await request(app)
                .post('/api/entities/entity-123/proxy')
                .set('Authorization', 'Bearer valid-token')
                .send({ method: 'GET', path: '/api/nonexistent' });

            expect(response.status).toBe(404);
            expect(response.body.error.code).toBe('NOT_FOUND');
        });

        it('should map 429 errors to RATE_LIMITED', async () => {
            const rateLimitError = new Error('Too Many Requests');
            rateLimitError.response = {
                status: 429,
                data: { error: 'rate_limit' },
            };

            mockApiRequester.request = jest
                .fn()
                .mockRejectedValue(rateLimitError);

            const response = await request(app)
                .post('/api/entities/entity-123/proxy')
                .set('Authorization', 'Bearer valid-token')
                .send({ method: 'GET', path: '/api/test' });

            expect(response.status).toBe(429);
            expect(response.body.error.code).toBe('RATE_LIMITED');
        });

        it('should map 500 errors to UPSTREAM_ERROR', async () => {
            const serverError = new Error('Internal Server Error');
            serverError.response = {
                status: 500,
                data: { error: 'internal_error' },
            };

            mockApiRequester.request = jest.fn().mockRejectedValue(serverError);

            const response = await request(app)
                .post('/api/entities/entity-123/proxy')
                .set('Authorization', 'Bearer valid-token')
                .send({ method: 'GET', path: '/api/test' });

            expect(response.status).toBe(500);
            expect(response.body.error.code).toBe('UPSTREAM_ERROR');
        });

        it('should map 503 errors to SERVICE_UNAVAILABLE', async () => {
            const unavailableError = new Error('Service Unavailable');
            unavailableError.response = {
                status: 503,
                data: { error: 'maintenance_mode' },
            };

            mockApiRequester.request = jest
                .fn()
                .mockRejectedValue(unavailableError);

            const response = await request(app)
                .post('/api/entities/entity-123/proxy')
                .set('Authorization', 'Bearer valid-token')
                .send({ method: 'GET', path: '/api/test' });

            expect(response.status).toBe(503);
            expect(response.body.error.code).toBe('SERVICE_UNAVAILABLE');
        });

        it('should map network errors to NETWORK_ERROR', async () => {
            const networkError = new Error('Network error');
            networkError.code = 'ECONNREFUSED';
            networkError.type = 'system';

            mockApiRequester.request = jest
                .fn()
                .mockRejectedValue(networkError);

            const response = await request(app)
                .post('/api/entities/entity-123/proxy')
                .set('Authorization', 'Bearer valid-token')
                .send({ method: 'GET', path: '/api/test' });

            expect(response.status).toBe(502);
            expect(response.body.error.code).toBe('NETWORK_ERROR');
        });

        it('should map timeout errors to TIMEOUT', async () => {
            const timeoutError = new Error('Timeout');
            timeoutError.code = 'ETIMEDOUT';

            mockApiRequester.request = jest
                .fn()
                .mockRejectedValue(timeoutError);

            const response = await request(app)
                .post('/api/entities/entity-123/proxy')
                .set('Authorization', 'Bearer valid-token')
                .send({ method: 'GET', path: '/api/test' });

            expect(response.status).toBe(504);
            expect(response.body.error.code).toBe('TIMEOUT');
        });
    });

    describe('Schema Compliance', () => {
        beforeEach(() => {
            mockModuleRepository.findByIdForUser.mockResolvedValue(mockEntity);
            mockCredentialRepository.findById.mockResolvedValue(mockCredential);
        });

        it('should always include success field in response', async () => {
            // Arrange: Successful response
            mockApiRequester.request = jest.fn().mockResolvedValue({
                status: 200,
                headers: {},
                data: { test: true },
            });

            // Act
            const successResponse = await request(app)
                .post('/api/entities/entity-123/proxy')
                .set('Authorization', 'Bearer valid-token')
                .send({ method: 'GET', path: '/api/test' });

            // Arrange: Error response
            const error = new Error('Error');
            error.response = { status: 500, data: {} };
            mockApiRequester.request = jest.fn().mockRejectedValue(error);

            const errorResponse = await request(app)
                .post('/api/entities/entity-123/proxy')
                .set('Authorization', 'Bearer valid-token')
                .send({ method: 'GET', path: '/api/test' });

            // Assert: Both have success field
            expect(successResponse.body.success).toBe(true);
            expect(errorResponse.body.success).toBe(false);
        });

        it('should always include status field in response', async () => {
            // Arrange
            mockApiRequester.request = jest.fn().mockResolvedValue({
                status: 201,
                headers: {},
                data: {},
            });

            // Act
            const response = await request(app)
                .post('/api/entities/entity-123/proxy')
                .set('Authorization', 'Bearer valid-token')
                .send({ method: 'POST', path: '/api/test', body: {} });

            // Assert: Status field matches upstream status
            expect(response.body.status).toBe(201);
            expect(response.body).toHaveProperty('success');
            expect(response.body).toHaveProperty('data');
        });

        it('should include error object with required fields in error responses', async () => {
            // Arrange
            const error = new Error('Test Error');
            error.response = {
                status: 400,
                data: { error: 'test' },
            };

            mockApiRequester.request = jest.fn().mockRejectedValue(error);

            // Act
            const response = await request(app)
                .post('/api/entities/entity-123/proxy')
                .set('Authorization', 'Bearer valid-token')
                .send({ method: 'GET', path: '/api/test' });

            // Assert: Error object has required fields per schema
            expect(response.body.error).toHaveProperty('code');
            expect(response.body.error).toHaveProperty('message');
            expect(response.body.error.code).toMatch(/^[A-Z_]+$/); // Enum format
            expect(typeof response.body.error.message).toBe('string');
        });

        it('should include upstreamStatus when available', async () => {
            // Arrange
            const error = new Error('Upstream Error');
            error.response = {
                status: 422,
                data: { validation_error: true },
            };

            mockApiRequester.request = jest.fn().mockRejectedValue(error);

            // Act
            const response = await request(app)
                .post('/api/entities/entity-123/proxy')
                .set('Authorization', 'Bearer valid-token')
                .send({ method: 'POST', path: '/api/test', body: {} });

            // Assert
            expect(response.body.error).toHaveProperty('upstreamStatus');
            expect(response.body.error.upstreamStatus).toBe(422);
        });
    });

    describe('Security Considerations', () => {
        beforeEach(() => {
            mockModuleRepository.findByIdForUser.mockResolvedValue(mockEntity);
            mockCredentialRepository.findById.mockResolvedValue(mockCredential);
        });

        it('should not expose credential data in error responses', async () => {
            // Arrange: Error during request
            const error = new Error('API Error');
            error.response = {
                status: 500,
                data: { error: 'internal' },
            };

            mockApiRequester.request = jest.fn().mockRejectedValue(error);

            // Act
            const response = await request(app)
                .post('/api/entities/entity-123/proxy')
                .set('Authorization', 'Bearer valid-token')
                .send({ method: 'GET', path: '/api/test' });

            // Assert: Response should not leak credential data
            const responseString = JSON.stringify(response.body);
            expect(responseString).not.toContain('test-access-token');
            expect(responseString).not.toContain('test-refresh-token');
            expect(responseString).not.toContain(
                mockCredential.data.access_token
            );
        });

        it('should not expose internal system paths in errors', async () => {
            // Arrange: Internal error
            const internalError = new Error(
                'Internal error at /var/app/src/handler.js:123'
            );

            mockApiRequester.request = jest
                .fn()
                .mockRejectedValue(internalError);

            // Act
            const response = await request(app)
                .post('/api/entities/entity-123/proxy')
                .set('Authorization', 'Bearer valid-token')
                .send({ method: 'GET', path: '/api/test' });

            // Assert: Should not expose file paths
            expect(response.body.error.message).not.toContain('/var/app');
            expect(response.body.error.message).not.toContain('handler.js');
        });

        it('should strip authorization headers from proxied requests (handled by API)', async () => {
            // Arrange
            mockApiRequester.request = jest.fn().mockResolvedValue({
                status: 200,
                headers: {},
                data: { success: true },
            });

            // Act: Try to pass Authorization header manually
            const response = await request(app)
                .post('/api/entities/entity-123/proxy')
                .set('Authorization', 'Bearer valid-token')
                .send({
                    method: 'GET',
                    path: '/api/test',
                    headers: {
                        Authorization: 'Bearer malicious-token', // Should be ignored
                        'X-Custom': 'allowed',
                    },
                });

            // Assert: Auth header should be stripped, API handles auth
            expect(response.status).toBe(200);
            const requestCall = mockApiRequester.request.mock.calls[0][0];

            // Verify the user's auth header is NOT in the proxied request
            // The API requester will add proper auth headers via addAuthHeaders()
            expect(requestCall.headers).not.toHaveProperty('Authorization');
            expect(requestCall.headers['X-Custom']).toBe('allowed');
        });
    });

    describe('Performance & Reliability', () => {
        beforeEach(() => {
            mockModuleRepository.findByIdForUser.mockResolvedValue(mockEntity);
            mockCredentialRepository.findById.mockResolvedValue(mockCredential);
        });

        it('should handle slow but successful upstream responses', async () => {
            // Arrange: Simulate slow response
            mockApiRequester.request = jest.fn().mockImplementation(() => {
                return new Promise((resolve) => {
                    setTimeout(() => {
                        resolve({
                            status: 200,
                            headers: {},
                            data: { success: true },
                        });
                    }, 100); // 100ms delay
                });
            });

            // Act
            const startTime = Date.now();
            const response = await request(app)
                .post('/api/entities/entity-123/proxy')
                .set('Authorization', 'Bearer valid-token')
                .send({ method: 'GET', path: '/api/slow' });
            const duration = Date.now() - startTime;

            // Assert: Should wait and return success
            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(duration).toBeGreaterThanOrEqual(100);
        });

        it('should handle concurrent proxy requests independently', async () => {
            // Arrange: Different responses for concurrent requests
            let callCount = 0;
            mockApiRequester.request = jest.fn().mockImplementation(() => {
                callCount++;
                return Promise.resolve({
                    status: 200,
                    headers: {},
                    data: { request: callCount },
                });
            });

            // Act: Make concurrent requests
            const promises = [
                request(app)
                    .post('/api/entities/entity-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({ method: 'GET', path: '/api/test1' }),
                request(app)
                    .post('/api/entities/entity-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({ method: 'GET', path: '/api/test2' }),
                request(app)
                    .post('/api/entities/entity-123/proxy')
                    .set('Authorization', 'Bearer valid-token')
                    .send({ method: 'GET', path: '/api/test3' }),
            ];

            const responses = await Promise.all(promises);

            // Assert: All requests succeed independently
            expect(responses).toHaveLength(3);
            responses.forEach((res) => {
                expect(res.status).toBe(200);
                expect(res.body.success).toBe(true);
            });
            expect(mockApiRequester.request).toHaveBeenCalledTimes(3);
        });
    });

    describe('Integration with Module Factory', () => {
        beforeEach(() => {
            mockModuleRepository.findByIdForUser.mockResolvedValue(mockEntity);
            mockCredentialRepository.findById.mockResolvedValue(mockCredential);
        });

        it('should instantiate API module with correct credential', async () => {
            // Arrange
            mockApiRequester.request = jest.fn().mockResolvedValue({
                status: 200,
                headers: {},
                data: { success: true },
            });

            // Act
            const response = await request(app)
                .post('/api/entities/entity-123/proxy')
                .set('Authorization', 'Bearer valid-token')
                .send({ method: 'GET', path: '/api/test' });

            // Assert: Credential should be loaded before making request
            expect(mockCredentialRepository.findById).toHaveBeenCalledWith(
                'credential-123'
            );
            expect(response.status).toBe(200);
        });

        it('should handle API module instantiation failures gracefully', async () => {
            // Arrange: Module factory fails to create API instance
            // This will be mocked in the implementation
            mockCredentialRepository.findById.mockRejectedValue(
                new Error('Failed to instantiate API module')
            );

            // Act
            const response = await request(app)
                .post('/api/entities/entity-123/proxy')
                .set('Authorization', 'Bearer valid-token')
                .send({ method: 'GET', path: '/api/test' });

            // Assert: Should return error
            expect(response.status).toBeGreaterThanOrEqual(400);
            expect(response.body.success).toBe(false);
        });
    });

    describe('Request Path Handling', () => {
        beforeEach(() => {
            mockModuleRepository.findByIdForUser.mockResolvedValue(mockEntity);
            mockCredentialRepository.findById.mockResolvedValue(mockCredential);

            mockApiRequester.request = jest.fn().mockResolvedValue({
                status: 200,
                headers: {},
                data: { success: true },
            });
        });

        it('should handle simple paths', async () => {
            const response = await request(app)
                .post('/api/entities/entity-123/proxy')
                .set('Authorization', 'Bearer valid-token')
                .send({ method: 'GET', path: '/users' });

            expect(response.status).toBe(200);
            expect(mockApiRequester.request).toHaveBeenCalledWith(
                expect.objectContaining({ url: '/users' })
            );
        });

        it('should handle nested paths', async () => {
            const response = await request(app)
                .post('/api/entities/entity-123/proxy')
                .set('Authorization', 'Bearer valid-token')
                .send({
                    method: 'GET',
                    path: '/api/v2/contacts/123/activities',
                });

            expect(response.status).toBe(200);
            expect(mockApiRequester.request).toHaveBeenCalledWith(
                expect.objectContaining({
                    url: '/api/v2/contacts/123/activities',
                })
            );
        });

        it('should handle paths with special characters', async () => {
            const response = await request(app)
                .post('/api/entities/entity-123/proxy')
                .set('Authorization', 'Bearer valid-token')
                .send({
                    method: 'GET',
                    path: '/api/users/john.doe@example.com',
                });

            expect(response.status).toBe(200);
            expect(mockApiRequester.request).toHaveBeenCalledWith(
                expect.objectContaining({
                    url: '/api/users/john.doe@example.com',
                })
            );
        });

        it('should handle paths with encoded characters', async () => {
            const response = await request(app)
                .post('/api/entities/entity-123/proxy')
                .set('Authorization', 'Bearer valid-token')
                .send({ method: 'GET', path: '/api/search/test%20query' });

            expect(response.status).toBe(200);
            expect(mockApiRequester.request).toHaveBeenCalledWith(
                expect.objectContaining({ url: '/api/search/test%20query' })
            );
        });
    });

    describe('Response Data Integrity', () => {
        beforeEach(() => {
            mockModuleRepository.findByIdForUser.mockResolvedValue(mockEntity);
            mockCredentialRepository.findById.mockResolvedValue(mockCredential);
        });

        it('should preserve exact response data structure from upstream', async () => {
            // Arrange: Complex nested response
            const complexResponse = {
                metadata: {
                    total: 100,
                    page: 1,
                    per_page: 10,
                },
                data: [
                    {
                        id: 'item-1',
                        attributes: {
                            name: 'Test',
                            tags: ['tag1', 'tag2'],
                            settings: {
                                enabled: true,
                                value: 42,
                            },
                        },
                    },
                ],
                links: {
                    next: '/api/items?page=2',
                    prev: null,
                },
            };

            mockApiRequester.request = jest.fn().mockResolvedValue({
                status: 200,
                headers: {},
                data: complexResponse,
            });

            // Act
            const response = await request(app)
                .post('/api/entities/entity-123/proxy')
                .set('Authorization', 'Bearer valid-token')
                .send({ method: 'GET', path: '/api/items' });

            // Assert: Data structure preserved exactly
            expect(response.status).toBe(200);
            expect(response.body.data).toEqual(complexResponse);
        });

        it('should preserve error details structure from upstream', async () => {
            // Arrange: Complex error response
            const complexError = new Error('Validation Failed');
            complexError.response = {
                status: 422,
                headers: {},
                data: {
                    error: 'validation_failed',
                    message: 'Multiple validation errors',
                    errors: [
                        { field: 'email', message: 'Invalid email format' },
                        { field: 'age', message: 'Must be >= 0' },
                    ],
                    documentation_url: 'https://api.example.com/docs/errors',
                },
            };

            mockApiRequester.request = jest
                .fn()
                .mockRejectedValue(complexError);

            // Act
            const response = await request(app)
                .post('/api/entities/entity-123/proxy')
                .set('Authorization', 'Bearer valid-token')
                .send({ method: 'POST', path: '/api/users', body: {} });

            // Assert: Error details preserved
            expect(response.status).toBe(422);
            expect(response.body.error.details).toEqual({
                error: 'validation_failed',
                message: 'Multiple validation errors',
                errors: [
                    { field: 'email', message: 'Invalid email format' },
                    { field: 'age', message: 'Must be >= 0' },
                ],
                documentation_url: 'https://api.example.com/docs/errors',
            });
        });
    });

    describe('Query Parameter Edge Cases', () => {
        beforeEach(() => {
            mockModuleRepository.findByIdForUser.mockResolvedValue(mockEntity);
            mockCredentialRepository.findById.mockResolvedValue(mockCredential);

            mockApiRequester.request = jest.fn().mockResolvedValue({
                status: 200,
                headers: {},
                data: { success: true },
            });
        });

        it('should handle empty query object', async () => {
            const response = await request(app)
                .post('/api/entities/entity-123/proxy')
                .set('Authorization', 'Bearer valid-token')
                .send({
                    method: 'GET',
                    path: '/api/test',
                    query: {},
                });

            expect(response.status).toBe(200);
            expect(mockApiRequester.request).toHaveBeenCalledWith(
                expect.objectContaining({ query: {} })
            );
        });

        it('should handle query with boolean values', async () => {
            const response = await request(app)
                .post('/api/entities/entity-123/proxy')
                .set('Authorization', 'Bearer valid-token')
                .send({
                    method: 'GET',
                    path: '/api/test',
                    query: {
                        active: true,
                        archived: false,
                    },
                });

            expect(response.status).toBe(200);
            expect(mockApiRequester.request).toHaveBeenCalledWith(
                expect.objectContaining({
                    query: { active: true, archived: false },
                })
            );
        });

        it('should handle query with numeric values', async () => {
            const response = await request(app)
                .post('/api/entities/entity-123/proxy')
                .set('Authorization', 'Bearer valid-token')
                .send({
                    method: 'GET',
                    path: '/api/test',
                    query: {
                        limit: 100,
                        offset: 0,
                        score: 4.5,
                    },
                });

            expect(response.status).toBe(200);
            expect(mockApiRequester.request).toHaveBeenCalledWith(
                expect.objectContaining({
                    query: { limit: 100, offset: 0, score: 4.5 },
                })
            );
        });

        it('should handle query with array values', async () => {
            const response = await request(app)
                .post('/api/entities/entity-123/proxy')
                .set('Authorization', 'Bearer valid-token')
                .send({
                    method: 'GET',
                    path: '/api/test',
                    query: {
                        ids: ['id1', 'id2', 'id3'],
                        tags: ['tag1', 'tag2'],
                    },
                });

            expect(response.status).toBe(200);
            expect(mockApiRequester.request).toHaveBeenCalledWith(
                expect.objectContaining({
                    query: {
                        ids: ['id1', 'id2', 'id3'],
                        tags: ['tag1', 'tag2'],
                    },
                })
            );
        });

        it('should handle query with mixed types', async () => {
            const response = await request(app)
                .post('/api/entities/entity-123/proxy')
                .set('Authorization', 'Bearer valid-token')
                .send({
                    method: 'GET',
                    path: '/api/test',
                    query: {
                        search: 'test query',
                        limit: 50,
                        active: true,
                        tags: ['tag1', 'tag2'],
                    },
                });

            expect(response.status).toBe(200);
            expect(mockApiRequester.request).toHaveBeenCalledWith(
                expect.objectContaining({
                    query: {
                        search: 'test query',
                        limit: 50,
                        active: true,
                        tags: ['tag1', 'tag2'],
                    },
                })
            );
        });

        it('should reject query with nested object values', async () => {
            const response = await request(app)
                .post('/api/entities/entity-123/proxy')
                .set('Authorization', 'Bearer valid-token')
                .send({
                    method: 'GET',
                    path: '/api/test',
                    query: {
                        filter: { status: 'active' }, // Not allowed per schema
                    },
                });

            expect(response.status).toBe(400);
            expect(response.body.error.code).toBe('INVALID_REQUEST');
        });

        it('should reject query with null values', async () => {
            const response = await request(app)
                .post('/api/entities/entity-123/proxy')
                .set('Authorization', 'Bearer valid-token')
                .send({
                    method: 'GET',
                    path: '/api/test',
                    query: {
                        filter: null, // Not allowed per schema
                    },
                });

            expect(response.status).toBe(400);
            expect(response.body.error.code).toBe('INVALID_REQUEST');
        });

        it('should reject query with array of non-strings', async () => {
            const response = await request(app)
                .post('/api/entities/entity-123/proxy')
                .set('Authorization', 'Bearer valid-token')
                .send({
                    method: 'GET',
                    path: '/api/test',
                    query: {
                        ids: [1, 2, 3], // Must be strings per schema
                    },
                });

            expect(response.status).toBe(400);
            expect(response.body.error.code).toBe('INVALID_REQUEST');
            expect(response.body.error.message).toContain(
                'array items must be strings'
            );
        });
    });

    describe('HTTP Method Specific Behaviors', () => {
        beforeEach(() => {
            mockModuleRepository.findByIdForUser.mockResolvedValue(mockEntity);
            mockCredentialRepository.findById.mockResolvedValue(mockCredential);

            mockApiRequester.request = jest.fn().mockResolvedValue({
                status: 200,
                headers: {},
                data: { success: true },
            });
        });

        it('should allow GET without body', async () => {
            const response = await request(app)
                .post('/api/entities/entity-123/proxy')
                .set('Authorization', 'Bearer valid-token')
                .send({
                    method: 'GET',
                    path: '/api/test',
                    // No body field
                });

            expect(response.status).toBe(200);
            expect(mockApiRequester.request).toHaveBeenCalledWith(
                expect.objectContaining({ body: undefined })
            );
        });

        it('should allow DELETE without body', async () => {
            mockApiRequester.request = jest.fn().mockResolvedValue({
                status: 204,
                headers: {},
                data: null,
            });

            const response = await request(app)
                .post('/api/entities/entity-123/proxy')
                .set('Authorization', 'Bearer valid-token')
                .send({
                    method: 'DELETE',
                    path: '/api/items/123',
                });

            expect(response.status).toBe(200);
            expect(response.body.status).toBe(204);
        });

        it('should allow POST with body', async () => {
            const response = await request(app)
                .post('/api/entities/entity-123/proxy')
                .set('Authorization', 'Bearer valid-token')
                .send({
                    method: 'POST',
                    path: '/api/items',
                    body: { name: 'Test' },
                });

            expect(response.status).toBe(200);
            expect(mockApiRequester.request).toHaveBeenCalledWith(
                expect.objectContaining({
                    body: { name: 'Test' },
                })
            );
        });

        it('should allow PUT with body', async () => {
            const response = await request(app)
                .post('/api/entities/entity-123/proxy')
                .set('Authorization', 'Bearer valid-token')
                .send({
                    method: 'PUT',
                    path: '/api/items/123',
                    body: { name: 'Updated' },
                });

            expect(response.status).toBe(200);
            expect(mockApiRequester.request).toHaveBeenCalledWith(
                expect.objectContaining({
                    body: { name: 'Updated' },
                })
            );
        });

        it('should allow PATCH with body', async () => {
            const response = await request(app)
                .post('/api/entities/entity-123/proxy')
                .set('Authorization', 'Bearer valid-token')
                .send({
                    method: 'PATCH',
                    path: '/api/items/123',
                    body: { status: 'active' },
                });

            expect(response.status).toBe(200);
            expect(mockApiRequester.request).toHaveBeenCalledWith(
                expect.objectContaining({
                    body: { status: 'active' },
                })
            );
        });
    });
});
