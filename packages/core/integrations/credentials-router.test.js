/**
 * @file Credentials Router Tests (TDD)
 *
 * Tests for credentials management endpoints:
 * - GET /api/credentials - List user's credentials
 * - GET /api/credentials/:id - Get single credential
 * - DELETE /api/credentials/:id - Delete credential
 * - GET /api/credentials/:id/reauthorize - Get reauth requirements
 * - POST /api/credentials/:id/reauthorize - Submit reauth data
 */

const request = require('supertest');
const express = require('express');
const Boom = require('@hapi/boom');

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

describe('Credentials Router - TDD Tests', () => {
    let app;
    let mockUserRepository;
    let mockCredentialRepository;
    let mockModuleRepository;
    let mockIntegrationRepository;
    let mockModuleFactory;
    let mockUser;

    const mockCredential = {
        id: 'cred-123',
        type: 'hubspot',
        userId: 'user-123',
        externalId: 'hub-account-456',
        authIsValid: true,
        status: 'AUTHORIZED',
        createdAt: '2025-01-25T10:00:00.000Z',
        updatedAt: '2025-01-25T10:00:00.000Z',
        data: {
            access_token: 'secret-token',
            refresh_token: 'secret-refresh',
        },
    };

    const mockCredential2 = {
        id: 'cred-456',
        type: 'salesforce',
        userId: 'user-123',
        externalId: 'sf-org-789',
        authIsValid: false,
        status: 'NEEDS_REAUTH',
        createdAt: '2025-01-20T08:00:00.000Z',
        updatedAt: '2025-01-24T15:00:00.000Z',
        data: {
            access_token: 'expired-token',
            refresh_token: 'expired-refresh',
        },
    };

    beforeEach(() => {
        mockUser = {
            getId: jest.fn().mockReturnValue('user-123'),
            id: 'user-123',
        };

        mockUserRepository = {
            findById: jest.fn().mockResolvedValue(mockUser),
            findByToken: jest.fn().mockResolvedValue(mockUser),
            getSessionToken: jest.fn().mockResolvedValue(mockUser),
            findIndividualUserById: jest.fn().mockResolvedValue(mockUser),
            findOrganizationUserById: jest.fn().mockResolvedValue(null),
            findByEmail: jest.fn().mockResolvedValue(mockUser),
        };

        mockCredentialRepository = {
            findCredential: jest.fn(),
            findCredentialById: jest.fn(),
            findByIdForUser: jest.fn(),
            deleteCredentialById: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
        };

        mockModuleRepository = {
            findById: jest.fn(),
            findByIdForUser: jest.fn(),
            findModuleById: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
        };

        mockIntegrationRepository = {
            findById: jest.fn(),
            findByIdForUser: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
        };

        mockModuleFactory = {
            getModuleInstance: jest.fn(),
        };

        createUserRepository.mockReturnValue(mockUserRepository);
        createCredentialRepository.mockReturnValue(mockCredentialRepository);
        createModuleRepository.mockReturnValue(mockModuleRepository);
        createIntegrationRepository.mockReturnValue(mockIntegrationRepository);

        ModuleFactory.mockImplementation(function () {
            return mockModuleFactory;
        });

        loadAppDefinition.mockReturnValue({
            integrations: [
                {
                    moduleName: 'hubspot',
                    definition: {
                        getDisplayName: () => 'HubSpot',
                        getAuthType: () => 'oauth2',
                        getAuthStepCount: () => 1,
                        getAuthRequirementsForStep: jest
                            .fn()
                            .mockResolvedValue({
                                type: 'oauth2',
                                data: {
                                    url: 'https://app.hubspot.com/oauth/authorize',
                                },
                            }),
                        processAuthorizationCallback: jest.fn(),
                    },
                },
                {
                    moduleName: 'salesforce',
                    definition: {
                        getDisplayName: () => 'Salesforce',
                        getAuthType: () => 'oauth2',
                        getAuthStepCount: () => 1,
                        getAuthRequirementsForStep: jest
                            .fn()
                            .mockResolvedValue({
                                type: 'oauth2',
                                data: {
                                    url: 'https://login.salesforce.com/oauth2/authorize',
                                },
                            }),
                        processAuthorizationCallback: jest.fn(),
                    },
                },
            ],
            userConfig: {
                usePassword: true,
                primary: 'individual',
            },
        });

        app = express();
        app.use(express.json());

        app.use((req, res, next) => {
            if (req.headers.authorization === 'Bearer valid-token') {
                req.user = mockUser;
            }
            next();
        });

        const router = createIntegrationRouter();
        app.use(router);

        app.use((err, req, res, next) => {
            if (Boom.isBoom(err)) {
                const { statusCode, payload } = err.output;
                return res.status(statusCode).json({
                    error: payload.message,
                    statusCode: payload.statusCode,
                });
            }
            res.status(500).json({ error: err.message });
        });
    });

    describe('GET /api/credentials', () => {
        it('should return list of credentials for authenticated user', async () => {
            mockCredentialRepository.findCredential.mockResolvedValue([
                mockCredential,
                mockCredential2,
            ]);

            const response = await request(app)
                .get('/api/credentials')
                .set('Authorization', 'Bearer valid-token');

            expect(response.status).toBe(200);
            expect(response.body.credentials).toHaveLength(2);
            expect(response.body.credentials[0].id).toBe('cred-123');
            expect(response.body.credentials[0].type).toBe('hubspot');
            expect(response.body.credentials[0].authIsValid).toBe(true);
            expect(response.body.credentials[1].id).toBe('cred-456');
            expect(response.body.credentials[1].authIsValid).toBe(false);
        });

        it('should return empty array when user has no credentials', async () => {
            mockCredentialRepository.findCredential.mockResolvedValue([]);

            const response = await request(app)
                .get('/api/credentials')
                .set('Authorization', 'Bearer valid-token');

            expect(response.status).toBe(200);
            expect(response.body.credentials).toEqual([]);
        });

        it('should mask sensitive token data in response', async () => {
            mockCredentialRepository.findCredential.mockResolvedValue([
                mockCredential,
            ]);

            const response = await request(app)
                .get('/api/credentials')
                .set('Authorization', 'Bearer valid-token');

            expect(response.status).toBe(200);
            expect(response.body.credentials[0].data).toBeUndefined();
        });

        it('should return 401 when not authenticated', async () => {
            const response = await request(app).get('/api/credentials');

            expect(response.status).toBe(401);
        });
    });

    describe('GET /api/credentials/:id', () => {
        it('should return single credential by id', async () => {
            mockCredentialRepository.findCredentialById.mockResolvedValue(
                mockCredential
            );

            const response = await request(app)
                .get('/api/credentials/cred-123')
                .set('Authorization', 'Bearer valid-token');

            expect(response.status).toBe(200);
            expect(response.body.id).toBe('cred-123');
            expect(response.body.type).toBe('hubspot');
            expect(response.body.authIsValid).toBe(true);
        });

        it('should return 404 when credential not found', async () => {
            mockCredentialRepository.findCredentialById.mockResolvedValue(null);

            const response = await request(app)
                .get('/api/credentials/nonexistent')
                .set('Authorization', 'Bearer valid-token');

            expect(response.status).toBe(404);
        });

        it('should return 403 when credential belongs to different user', async () => {
            const otherUserCredential = {
                ...mockCredential,
                userId: 'other-user',
            };
            mockCredentialRepository.findCredentialById.mockResolvedValue(
                otherUserCredential
            );

            const response = await request(app)
                .get('/api/credentials/cred-123')
                .set('Authorization', 'Bearer valid-token');

            expect(response.status).toBe(403);
        });

        it('should mask sensitive token data in response', async () => {
            mockCredentialRepository.findCredentialById.mockResolvedValue(
                mockCredential
            );

            const response = await request(app)
                .get('/api/credentials/cred-123')
                .set('Authorization', 'Bearer valid-token');

            expect(response.status).toBe(200);
            expect(response.body.data).toBeUndefined();
        });

        it('should return 401 when not authenticated', async () => {
            const response = await request(app).get(
                '/api/credentials/cred-123'
            );

            expect(response.status).toBe(401);
        });
    });

    describe('DELETE /api/credentials/:id', () => {
        it('should delete credential and return success', async () => {
            mockCredentialRepository.findCredentialById.mockResolvedValue(
                mockCredential
            );
            mockCredentialRepository.deleteCredentialById.mockResolvedValue({
                deletedCount: 1,
            });

            const response = await request(app)
                .delete('/api/credentials/cred-123')
                .set('Authorization', 'Bearer valid-token');

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(
                mockCredentialRepository.deleteCredentialById
            ).toHaveBeenCalledWith('cred-123');
        });

        it('should return 404 when credential not found', async () => {
            mockCredentialRepository.findCredentialById.mockResolvedValue(null);

            const response = await request(app)
                .delete('/api/credentials/nonexistent')
                .set('Authorization', 'Bearer valid-token');

            expect(response.status).toBe(404);
        });

        it('should return 403 when credential belongs to different user', async () => {
            const otherUserCredential = {
                ...mockCredential,
                userId: 'other-user',
            };
            mockCredentialRepository.findCredentialById.mockResolvedValue(
                otherUserCredential
            );

            const response = await request(app)
                .delete('/api/credentials/cred-123')
                .set('Authorization', 'Bearer valid-token');

            expect(response.status).toBe(403);
            expect(
                mockCredentialRepository.deleteCredentialById
            ).not.toHaveBeenCalled();
        });

        it('should return 401 when not authenticated', async () => {
            const response = await request(app).delete(
                '/api/credentials/cred-123'
            );

            expect(response.status).toBe(401);
        });
    });

    describe('GET /api/credentials/:id/reauthorize', () => {
        it('should return authorization requirements for credential type', async () => {
            mockCredentialRepository.findCredentialById.mockResolvedValue(
                mockCredential
            );

            const response = await request(app)
                .get('/api/credentials/cred-123/reauthorize')
                .set('Authorization', 'Bearer valid-token');

            expect(response.status).toBe(200);
            expect(response.body.type).toBe('oauth2');
            expect(response.body.data).toBeDefined();
            expect(response.body.data.url).toContain('hubspot');
        });

        it('should return 404 when credential not found', async () => {
            mockCredentialRepository.findCredentialById.mockResolvedValue(null);

            const response = await request(app)
                .get('/api/credentials/nonexistent/reauthorize')
                .set('Authorization', 'Bearer valid-token');

            expect(response.status).toBe(404);
        });

        it('should return 403 when credential belongs to different user', async () => {
            const otherUserCredential = {
                ...mockCredential,
                userId: 'other-user',
            };
            mockCredentialRepository.findCredentialById.mockResolvedValue(
                otherUserCredential
            );

            const response = await request(app)
                .get('/api/credentials/cred-123/reauthorize')
                .set('Authorization', 'Bearer valid-token');

            expect(response.status).toBe(403);
        });

        it('should return 401 when not authenticated', async () => {
            const response = await request(app).get(
                '/api/credentials/cred-123/reauthorize'
            );

            expect(response.status).toBe(401);
        });
    });

    describe('POST /api/credentials/:id/reauthorize', () => {
        it('should reauthorize credential and return success', async () => {
            mockCredentialRepository.findCredentialById
                .mockResolvedValueOnce(mockCredential)
                .mockResolvedValueOnce({
                    ...mockCredential,
                    authIsValid: true,
                });

            mockModuleRepository.findModuleById.mockResolvedValue({
                processAuthorizationCallback: jest.fn().mockResolvedValue({
                    success: true,
                    message: 'Reauthorization successful',
                }),
            });

            const response = await request(app)
                .post('/api/credentials/cred-123/reauthorize')
                .set('Authorization', 'Bearer valid-token')
                .send({
                    data: { code: 'oauth-code-123' },
                });

            expect(response.status).toBe(200);
            expect(response.body.success).toBe(true);
            expect(response.body.credential_id).toBe('cred-123');
            expect(response.body.authIsValid).toBe(true);
        });

        it('should return 400 when data is missing', async () => {
            const response = await request(app)
                .post('/api/credentials/cred-123/reauthorize')
                .set('Authorization', 'Bearer valid-token')
                .send({});

            expect(response.status).toBe(400);
        });

        it('should return 404 when credential not found', async () => {
            mockCredentialRepository.findCredentialById.mockResolvedValue(null);

            const response = await request(app)
                .post('/api/credentials/nonexistent/reauthorize')
                .set('Authorization', 'Bearer valid-token')
                .send({ data: { code: 'test' } });

            expect(response.status).toBe(404);
        });

        it('should return 403 when credential belongs to different user', async () => {
            const otherUserCredential = {
                ...mockCredential,
                userId: 'other-user',
            };
            mockCredentialRepository.findCredentialById.mockResolvedValue(
                otherUserCredential
            );

            const response = await request(app)
                .post('/api/credentials/cred-123/reauthorize')
                .set('Authorization', 'Bearer valid-token')
                .send({ data: { code: 'test' } });

            expect(response.status).toBe(403);
        });

        it('should return 401 when not authenticated', async () => {
            const response = await request(app)
                .post('/api/credentials/cred-123/reauthorize')
                .send({ data: { code: 'test' } });

            expect(response.status).toBe(401);
        });
    });
});
