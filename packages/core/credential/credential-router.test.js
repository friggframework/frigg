const express = require('express');
const request = require('supertest');
const { createCredentialRouter, boomErrorHandler } = require('./credential-router');
const Boom = require('@hapi/boom');

// Mock dependencies
jest.mock('../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
}));

jest.mock('../credential/repositories/credential-repository-factory');
jest.mock('../user/repositories/user-repository-factory');
jest.mock('../modules/repositories/module-repository-factory');
jest.mock('../handlers/app-definition-loader');

const {
    createCredentialRepository,
} = require('../credential/repositories/credential-repository-factory');
const {
    createUserRepository,
} = require('../user/repositories/user-repository-factory');
const {
    createModuleRepository,
} = require('../modules/repositories/module-repository-factory');
const { loadAppDefinition } = require('../handlers/app-definition-loader');

describe('Credential Router', () => {
    let app;
    let mockCredentialRepository;
    let mockUserRepository;
    let mockModuleRepository;
    let mockAuthenticateUser;

    // Test data matching schema
    const mockUserId = 'user-123';
    const mockUser = {
        id: mockUserId,
        appUserId: 'app-user-123',
        username: 'testuser',
    };

    const mockCredential = {
        id: 'cred-123',
        type: 'hubspot',
        userId: mockUserId,
        authIsValid: true,
        externalId: 'ext-123',
        entityCount: 2,
        createdAt: '2025-01-25T10:00:00.000Z',
        updatedAt: '2025-01-25T10:00:00.000Z',
    };

    const mockCredentialInvalid = {
        id: 'cred-456',
        type: 'salesforce',
        userId: mockUserId,
        authIsValid: false,
        externalId: 'ext-456',
        entityCount: 0,
        createdAt: '2025-01-24T10:00:00.000Z',
        updatedAt: '2025-01-25T09:00:00.000Z',
    };

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();

        // Setup credential repository mock
        mockCredentialRepository = {
            findCredential: jest.fn(),
            findCredentialById: jest.fn(),
            deleteCredentialById: jest.fn(),
            updateCredential: jest.fn(),
        };

        // Setup user repository mock
        mockUserRepository = {
            findUserById: jest.fn(),
            findOne: jest.fn(),
        };

        // Setup module repository mock
        mockModuleRepository = {
            findModuleById: jest.fn(),
        };

        // Mock factory functions
        createCredentialRepository.mockReturnValue(mockCredentialRepository);
        createUserRepository.mockReturnValue(mockUserRepository);
        createModuleRepository.mockReturnValue(mockModuleRepository);

        // Mock app definition
        loadAppDefinition.mockReturnValue({
            integrations: [],
            userConfig: {
                authModes: {
                    friggToken: true,
                },
            },
        });

        // Setup Express app with router
        app = express();
        app.use(express.json());

        // Mock authentication middleware - injects req.user
        app.use((req, res, next) => {
            if (req.headers.authorization === 'Bearer valid-token') {
                req.user = mockUser;
                next();
            } else if (req.headers.authorization) {
                next(Boom.unauthorized('Invalid token'));
            } else {
                next(Boom.unauthorized('No authentication provided'));
            }
        });

        const router = createCredentialRouter();
        app.use('/api/credentials', router);

        // Add Boom error handler at app level to catch auth middleware errors
        app.use(boomErrorHandler);
    });

    describe('GET /api/credentials - List all credentials', () => {
        it('should return all credentials for authenticated user', async () => {
            // Arrange
            const mockCredentials = [mockCredential, mockCredentialInvalid];
            mockCredentialRepository.findCredential.mockResolvedValue(
                mockCredentials
            );

            // Act
            const response = await request(app)
                .get('/api/credentials')
                .set('Authorization', 'Bearer valid-token');

            // Assert
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('credentials');
            expect(response.body.credentials).toHaveLength(2);
            expect(response.body.credentials[0]).toMatchObject({
                id: mockCredential.id,
                type: mockCredential.type,
                userId: mockCredential.userId,
                authIsValid: mockCredential.authIsValid,
                externalId: mockCredential.externalId,
                entityCount: mockCredential.entityCount,
            });
            expect(mockCredentialRepository.findCredential).toHaveBeenCalledWith(
                { userId: mockUserId }
            );
        });

        it('should return empty array when user has no credentials', async () => {
            // Arrange
            mockCredentialRepository.findCredential.mockResolvedValue([]);

            // Act
            const response = await request(app)
                .get('/api/credentials')
                .set('Authorization', 'Bearer valid-token');

            // Assert
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('credentials');
            expect(response.body.credentials).toHaveLength(0);
        });

        it('should return 401 when not authenticated', async () => {
            // Act
            const response = await request(app).get('/api/credentials');

            // Assert
            expect(response.status).toBe(401);
        });

        it('should return 401 with invalid token', async () => {
            // Act
            const response = await request(app)
                .get('/api/credentials')
                .set('Authorization', 'Bearer invalid-token');

            // Assert
            expect(response.status).toBe(401);
        });

        it('should filter out sensitive token data from response', async () => {
            // Arrange
            const credentialWithTokens = {
                ...mockCredential,
                data: {
                    access_token: 'secret-access-token',
                    refresh_token: 'secret-refresh-token',
                    domain: 'user-domain.com',
                    id_token: 'secret-id-token',
                },
            };
            mockCredentialRepository.findCredential.mockResolvedValue([
                credentialWithTokens,
            ]);

            // Act
            const response = await request(app)
                .get('/api/credentials')
                .set('Authorization', 'Bearer valid-token');

            // Assert
            expect(response.status).toBe(200);
            expect(response.body.credentials[0]).not.toHaveProperty('data');
        });

        it('should handle repository errors gracefully', async () => {
            // Arrange
            mockCredentialRepository.findCredential.mockRejectedValue(
                new Error('Database connection failed')
            );

            // Act
            const response = await request(app)
                .get('/api/credentials')
                .set('Authorization', 'Bearer valid-token');

            // Assert
            expect(response.status).toBe(500);
        });
    });

    describe('GET /api/credentials/:id - Get single credential', () => {
        it('should return credential when it belongs to authenticated user', async () => {
            // Arrange
            mockCredentialRepository.findCredentialById.mockResolvedValue(
                mockCredential
            );

            // Act
            const response = await request(app)
                .get('/api/credentials/cred-123')
                .set('Authorization', 'Bearer valid-token');

            // Assert
            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({
                id: mockCredential.id,
                type: mockCredential.type,
                userId: mockCredential.userId,
                authIsValid: mockCredential.authIsValid,
                externalId: mockCredential.externalId,
                entityCount: mockCredential.entityCount,
            });
            expect(mockCredentialRepository.findCredentialById).toHaveBeenCalledWith(
                'cred-123'
            );
        });

        it('should return 404 when credential does not exist', async () => {
            // Arrange
            mockCredentialRepository.findCredentialById.mockResolvedValue(null);

            // Act
            const response = await request(app)
                .get('/api/credentials/nonexistent')
                .set('Authorization', 'Bearer valid-token');

            // Assert
            expect(response.status).toBe(404);
            expect(response.body).toHaveProperty('error');
        });

        it('should return 403 when credential belongs to different user', async () => {
            // Arrange
            const otherUserCredential = {
                ...mockCredential,
                userId: 'different-user-id',
            };
            mockCredentialRepository.findCredentialById.mockResolvedValue(
                otherUserCredential
            );

            // Act
            const response = await request(app)
                .get('/api/credentials/cred-123')
                .set('Authorization', 'Bearer valid-token');

            // Assert
            expect(response.status).toBe(403);
            expect(response.body).toHaveProperty('error');
        });

        it('should return 401 when not authenticated', async () => {
            // Act
            const response = await request(app).get(
                '/api/credentials/cred-123'
            );

            // Assert
            expect(response.status).toBe(401);
        });

        it('should filter out sensitive token data from response', async () => {
            // Arrange
            const credentialWithTokens = {
                ...mockCredential,
                data: {
                    access_token: 'secret-access-token',
                    refresh_token: 'secret-refresh-token',
                },
            };
            mockCredentialRepository.findCredentialById.mockResolvedValue(
                credentialWithTokens
            );

            // Act
            const response = await request(app)
                .get('/api/credentials/cred-123')
                .set('Authorization', 'Bearer valid-token');

            // Assert
            expect(response.status).toBe(200);
            expect(response.body).not.toHaveProperty('data');
        });

        it('should include timestamps in ISO 8601 format', async () => {
            // Arrange
            mockCredentialRepository.findCredentialById.mockResolvedValue(
                mockCredential
            );

            // Act
            const response = await request(app)
                .get('/api/credentials/cred-123')
                .set('Authorization', 'Bearer valid-token');

            // Assert
            expect(response.status).toBe(200);
            expect(response.body.createdAt).toMatch(
                /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
            );
            expect(response.body.updatedAt).toMatch(
                /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/
            );
        });
    });

    describe('DELETE /api/credentials/:id - Delete credential', () => {
        it('should delete credential when it belongs to authenticated user', async () => {
            // Arrange
            mockCredentialRepository.findCredentialById.mockResolvedValue(
                mockCredential
            );
            mockCredentialRepository.deleteCredentialById.mockResolvedValue({
                deletedCount: 1,
            });

            // Act
            const response = await request(app)
                .delete('/api/credentials/cred-123')
                .set('Authorization', 'Bearer valid-token');

            // Assert
            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({
                success: true,
                message: expect.any(String),
            });
            expect(
                mockCredentialRepository.deleteCredentialById
            ).toHaveBeenCalledWith('cred-123');
        });

        it('should return 404 when credential does not exist', async () => {
            // Arrange
            mockCredentialRepository.findCredentialById.mockResolvedValue(null);

            // Act
            const response = await request(app)
                .delete('/api/credentials/nonexistent')
                .set('Authorization', 'Bearer valid-token');

            // Assert
            expect(response.status).toBe(404);
            expect(response.body).toHaveProperty('error');
            expect(
                mockCredentialRepository.deleteCredentialById
            ).not.toHaveBeenCalled();
        });

        it('should return 403 when credential belongs to different user', async () => {
            // Arrange
            const otherUserCredential = {
                ...mockCredential,
                userId: 'different-user-id',
            };
            mockCredentialRepository.findCredentialById.mockResolvedValue(
                otherUserCredential
            );

            // Act
            const response = await request(app)
                .delete('/api/credentials/cred-123')
                .set('Authorization', 'Bearer valid-token');

            // Assert
            expect(response.status).toBe(403);
            expect(response.body).toHaveProperty('error');
            expect(
                mockCredentialRepository.deleteCredentialById
            ).not.toHaveBeenCalled();
        });

        it('should return 401 when not authenticated', async () => {
            // Act
            const response = await request(app).delete(
                '/api/credentials/cred-123'
            );

            // Assert
            expect(response.status).toBe(401);
        });

        it('should handle deletion failures gracefully', async () => {
            // Arrange
            mockCredentialRepository.findCredentialById.mockResolvedValue(
                mockCredential
            );
            mockCredentialRepository.deleteCredentialById.mockResolvedValue({
                deletedCount: 0,
            });

            // Act
            const response = await request(app)
                .delete('/api/credentials/cred-123')
                .set('Authorization', 'Bearer valid-token');

            // Assert
            expect(response.status).toBe(500);
        });

        it('should handle repository errors gracefully', async () => {
            // Arrange
            mockCredentialRepository.findCredentialById.mockResolvedValue(
                mockCredential
            );
            mockCredentialRepository.deleteCredentialById.mockRejectedValue(
                new Error('Database error')
            );

            // Act
            const response = await request(app)
                .delete('/api/credentials/cred-123')
                .set('Authorization', 'Bearer valid-token');

            // Assert
            expect(response.status).toBe(500);
        });
    });

    describe('POST /api/credentials/:id/reauthorize - Reauthorize credential', () => {
        const validReauthorizeRequest = {
            data: {
                code: 'oauth-code-123',
                redirectUri: 'https://app.example.com/callback',
            },
            step: 1,
        };

        it('should successfully complete single-step reauthorization', async () => {
            // Arrange
            mockCredentialRepository.findCredentialById.mockResolvedValue(
                mockCredentialInvalid
            );
            mockCredentialRepository.updateCredential.mockResolvedValue({
                ...mockCredentialInvalid,
                authIsValid: true,
            });

            // Mock module to return successful authorization
            const mockModule = {
                processAuthorizationCallback: jest
                    .fn()
                    .mockResolvedValue({ success: true }),
                Credential: {
                    findById: jest.fn().mockResolvedValue(mockCredentialInvalid),
                    findByIdAndUpdate: jest.fn().mockResolvedValue({
                        ...mockCredentialInvalid,
                        authIsValid: true,
                    }),
                },
            };
            mockModuleRepository.findModuleById.mockResolvedValue(mockModule);

            // Act
            const response = await request(app)
                .post('/api/credentials/cred-456/reauthorize')
                .set('Authorization', 'Bearer valid-token')
                .send(validReauthorizeRequest);

            // Assert
            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({
                success: true,
                credential_id: 'cred-456',
                authIsValid: true,
            });
        });

        it('should handle multi-step reauthorization flow', async () => {
            // Arrange
            mockCredentialRepository.findCredentialById.mockResolvedValue(
                mockCredentialInvalid
            );

            const mockModule = {
                processAuthorizationCallback: jest.fn().mockResolvedValue({
                    step: 2,
                    totalSteps: 2,
                    sessionId: 'session-123',
                    requirements: {
                        fields: [
                            {
                                name: 'otp',
                                type: 'string',
                                label: 'Enter OTP',
                            },
                        ],
                    },
                    message: 'OTP sent to your email',
                }),
                Credential: {
                    findById: jest.fn().mockResolvedValue(mockCredentialInvalid),
                },
            };
            mockModuleRepository.findModuleById.mockResolvedValue(mockModule);

            // Act
            const response = await request(app)
                .post('/api/credentials/cred-456/reauthorize')
                .set('Authorization', 'Bearer valid-token')
                .send(validReauthorizeRequest);

            // Assert
            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({
                step: 2,
                totalSteps: 2,
                sessionId: 'session-123',
                requirements: expect.any(Object),
                message: expect.any(String),
            });
            expect(response.body).not.toHaveProperty('success');
        });

        it('should complete second step of multi-step flow', async () => {
            // Arrange
            const secondStepRequest = {
                data: {
                    otp: '123456',
                },
                step: 2,
                sessionId: 'session-123',
            };

            mockCredentialRepository.findCredentialById.mockResolvedValue(
                mockCredentialInvalid
            );
            mockCredentialRepository.updateCredential.mockResolvedValue({
                ...mockCredentialInvalid,
                authIsValid: true,
            });

            const mockModule = {
                processAuthorizationCallback: jest
                    .fn()
                    .mockResolvedValue({ success: true }),
                Credential: {
                    findById: jest.fn().mockResolvedValue(mockCredentialInvalid),
                    findByIdAndUpdate: jest.fn().mockResolvedValue({
                        ...mockCredentialInvalid,
                        authIsValid: true,
                    }),
                },
            };
            mockModuleRepository.findModuleById.mockResolvedValue(mockModule);

            // Act
            const response = await request(app)
                .post('/api/credentials/cred-456/reauthorize')
                .set('Authorization', 'Bearer valid-token')
                .send(secondStepRequest);

            // Assert
            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({
                success: true,
                credential_id: 'cred-456',
                authIsValid: true,
            });
        });

        it('should return 400 when data is missing', async () => {
            // Act
            const response = await request(app)
                .post('/api/credentials/cred-456/reauthorize')
                .set('Authorization', 'Bearer valid-token')
                .send({ step: 1 });

            // Assert
            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error');
        });

        it('should return 400 when sessionId is missing for step > 1', async () => {
            // Act
            const response = await request(app)
                .post('/api/credentials/cred-456/reauthorize')
                .set('Authorization', 'Bearer valid-token')
                .send({
                    data: { otp: '123456' },
                    step: 2,
                });

            // Assert
            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error');
        });

        it('should return 404 when credential does not exist', async () => {
            // Arrange
            mockCredentialRepository.findCredentialById.mockResolvedValue(null);

            // Act
            const response = await request(app)
                .post('/api/credentials/nonexistent/reauthorize')
                .set('Authorization', 'Bearer valid-token')
                .send(validReauthorizeRequest);

            // Assert
            expect(response.status).toBe(404);
        });

        it('should return 403 when credential belongs to different user', async () => {
            // Arrange
            const otherUserCredential = {
                ...mockCredentialInvalid,
                userId: 'different-user-id',
            };
            mockCredentialRepository.findCredentialById.mockResolvedValue(
                otherUserCredential
            );

            // Act
            const response = await request(app)
                .post('/api/credentials/cred-456/reauthorize')
                .set('Authorization', 'Bearer valid-token')
                .send(validReauthorizeRequest);

            // Assert
            expect(response.status).toBe(403);
        });

        it('should return 401 when not authenticated', async () => {
            // Act
            const response = await request(app)
                .post('/api/credentials/cred-456/reauthorize')
                .send(validReauthorizeRequest);

            // Assert
            expect(response.status).toBe(401);
        });

        it('should handle authorization failures gracefully', async () => {
            // Arrange
            mockCredentialRepository.findCredentialById.mockResolvedValue(
                mockCredentialInvalid
            );

            const mockModule = {
                processAuthorizationCallback: jest
                    .fn()
                    .mockRejectedValue(new Error('Invalid OAuth code')),
                Credential: {
                    findById: jest.fn().mockResolvedValue(mockCredentialInvalid),
                },
            };
            mockModuleRepository.findModuleById.mockResolvedValue(mockModule);

            // Act
            const response = await request(app)
                .post('/api/credentials/cred-456/reauthorize')
                .set('Authorization', 'Bearer valid-token')
                .send(validReauthorizeRequest);

            // Assert
            expect(response.status).toBe(500);
        });

        it('should default step to 1 when not provided', async () => {
            // Arrange
            mockCredentialRepository.findCredentialById.mockResolvedValue(
                mockCredentialInvalid
            );
            mockCredentialRepository.updateCredential.mockResolvedValue({
                ...mockCredentialInvalid,
                authIsValid: true,
            });

            const mockModule = {
                processAuthorizationCallback: jest
                    .fn()
                    .mockResolvedValue({ success: true }),
                Credential: {
                    findById: jest.fn().mockResolvedValue(mockCredentialInvalid),
                    findByIdAndUpdate: jest.fn().mockResolvedValue({
                        ...mockCredentialInvalid,
                        authIsValid: true,
                    }),
                },
            };
            mockModuleRepository.findModuleById.mockResolvedValue(mockModule);

            // Act
            const response = await request(app)
                .post('/api/credentials/cred-456/reauthorize')
                .set('Authorization', 'Bearer valid-token')
                .send({ data: validReauthorizeRequest.data });

            // Assert
            expect(response.status).toBe(200);
            expect(mockModule.processAuthorizationCallback).toHaveBeenCalled();
        });

        it('should validate step is a positive integer', async () => {
            // Arrange - mock credential (though validation should happen before it's fetched)
            mockCredentialRepository.findCredentialById.mockResolvedValue(
                mockCredentialInvalid
            );

            // Act
            const response = await request(app)
                .post('/api/credentials/cred-456/reauthorize')
                .set('Authorization', 'Bearer valid-token')
                .send({
                    data: validReauthorizeRequest.data,
                    step: 0,
                });

            // Assert
            expect(response.status).toBe(400);
        });

        it('should include optional success message in response', async () => {
            // Arrange
            mockCredentialRepository.findCredentialById.mockResolvedValue(
                mockCredentialInvalid
            );
            mockCredentialRepository.updateCredential.mockResolvedValue({
                ...mockCredentialInvalid,
                authIsValid: true,
            });

            const mockModule = {
                processAuthorizationCallback: jest.fn().mockResolvedValue({
                    success: true,
                    message: 'Successfully reauthorized',
                }),
                Credential: {
                    findById: jest.fn().mockResolvedValue(mockCredentialInvalid),
                    findByIdAndUpdate: jest.fn().mockResolvedValue({
                        ...mockCredentialInvalid,
                        authIsValid: true,
                    }),
                },
            };
            mockModuleRepository.findModuleById.mockResolvedValue(mockModule);

            // Act
            const response = await request(app)
                .post('/api/credentials/cred-456/reauthorize')
                .set('Authorization', 'Bearer valid-token')
                .send(validReauthorizeRequest);

            // Assert
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('message');
            expect(response.body.message).toBe('Successfully reauthorized');
        });
    });

    describe('Credential ownership validation', () => {
        it('should correctly compare string and numeric user IDs', async () => {
            // Arrange - PostgreSQL returns numeric IDs
            const credentialWithNumericUserId = {
                ...mockCredential,
                userId: 123,
            };
            const userWithStringId = {
                ...mockUser,
                id: '123',
            };

            mockCredentialRepository.findCredentialById.mockResolvedValue(
                credentialWithNumericUserId
            );

            // Mock authentication to return string ID user
            app = express();
            app.use(express.json());
            app.use((req, res, next) => {
                if (req.headers.authorization === 'Bearer valid-token') {
                    req.user = userWithStringId;
                    next();
                } else {
                    next(Boom.unauthorized());
                }
            });
            const router = createCredentialRouter();
            app.use('/api/credentials', router);

            // Act
            const response = await request(app)
                .get('/api/credentials/cred-123')
                .set('Authorization', 'Bearer valid-token');

            // Assert
            expect(response.status).toBe(200);
        });
    });

    describe('Error handling middleware', () => {
        it('should sanitize internal errors in user-facing responses', async () => {
            // Arrange
            mockCredentialRepository.findCredential.mockRejectedValue(
                new Error('Internal database connection pool exhausted')
            );

            // Act
            const response = await request(app)
                .get('/api/credentials')
                .set('Authorization', 'Bearer valid-token');

            // Assert
            expect(response.status).toBe(500);
            expect(response.body.error).not.toContain('pool exhausted');
        });

        it('should preserve Boom error messages', async () => {
            // Arrange
            mockCredentialRepository.findCredentialById.mockResolvedValue({
                ...mockCredential,
                userId: 'different-user',
            });

            // Act
            const response = await request(app)
                .get('/api/credentials/cred-123')
                .set('Authorization', 'Bearer valid-token');

            // Assert
            expect(response.status).toBe(403);
            expect(response.body).toHaveProperty('error');
        });
    });

    describe('Response schema compliance', () => {
        it('should match listCredentialsResponse schema', async () => {
            // Arrange
            mockCredentialRepository.findCredential.mockResolvedValue([
                mockCredential,
            ]);

            // Act
            const response = await request(app)
                .get('/api/credentials')
                .set('Authorization', 'Bearer valid-token');

            // Assert
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('credentials');
            expect(Array.isArray(response.body.credentials)).toBe(true);
            expect(response.body.credentials[0]).toHaveProperty('id');
            expect(response.body.credentials[0]).toHaveProperty('type');
            expect(response.body.credentials[0]).toHaveProperty('userId');
            expect(response.body.credentials[0]).toHaveProperty('authIsValid');
        });

        it('should match getCredentialResponse schema', async () => {
            // Arrange
            mockCredentialRepository.findCredentialById.mockResolvedValue(
                mockCredential
            );

            // Act
            const response = await request(app)
                .get('/api/credentials/cred-123')
                .set('Authorization', 'Bearer valid-token');

            // Assert
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('id');
            expect(response.body).toHaveProperty('type');
            expect(response.body).toHaveProperty('userId');
            expect(response.body).toHaveProperty('authIsValid');
            expect(typeof response.body.authIsValid).toBe('boolean');
        });

        it('should match deleteCredentialResponse schema', async () => {
            // Arrange
            mockCredentialRepository.findCredentialById.mockResolvedValue(
                mockCredential
            );
            mockCredentialRepository.deleteCredentialById.mockResolvedValue({
                deletedCount: 1,
            });

            // Act
            const response = await request(app)
                .delete('/api/credentials/cred-123')
                .set('Authorization', 'Bearer valid-token');

            // Assert
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success');
            expect(typeof response.body.success).toBe('boolean');
        });

        it('should match reauthorizeCredentialSuccess schema', async () => {
            // Arrange
            mockCredentialRepository.findCredentialById.mockResolvedValue(
                mockCredentialInvalid
            );
            mockCredentialRepository.updateCredential.mockResolvedValue({
                ...mockCredentialInvalid,
                authIsValid: true,
            });

            const mockModule = {
                processAuthorizationCallback: jest
                    .fn()
                    .mockResolvedValue({ success: true }),
                Credential: {
                    findById: jest.fn().mockResolvedValue(mockCredentialInvalid),
                    findByIdAndUpdate: jest.fn().mockResolvedValue({
                        ...mockCredentialInvalid,
                        authIsValid: true,
                    }),
                },
            };
            mockModuleRepository.findModuleById.mockResolvedValue(mockModule);

            // Act
            const response = await request(app)
                .post('/api/credentials/cred-456/reauthorize')
                .set('Authorization', 'Bearer valid-token')
                .send({ data: { code: 'oauth-code' } });

            // Assert
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('success');
            expect(response.body.success).toBe(true);
            expect(response.body).toHaveProperty('credential_id');
            expect(response.body).toHaveProperty('authIsValid');
            expect(response.body.authIsValid).toBe(true);
        });

        it('should match reauthorizeCredentialNextStep schema', async () => {
            // Arrange
            mockCredentialRepository.findCredentialById.mockResolvedValue(
                mockCredentialInvalid
            );

            const mockModule = {
                processAuthorizationCallback: jest.fn().mockResolvedValue({
                    step: 2,
                    totalSteps: 3,
                    sessionId: 'session-abc',
                    requirements: { otp: true },
                    message: 'Enter OTP',
                }),
                Credential: {
                    findById: jest.fn().mockResolvedValue(mockCredentialInvalid),
                },
            };
            mockModuleRepository.findModuleById.mockResolvedValue(mockModule);

            // Act
            const response = await request(app)
                .post('/api/credentials/cred-456/reauthorize')
                .set('Authorization', 'Bearer valid-token')
                .send({ data: { username: 'test' } });

            // Assert
            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('step');
            expect(typeof response.body.step).toBe('number');
            expect(response.body.step).toBeGreaterThanOrEqual(2);
            expect(response.body).toHaveProperty('totalSteps');
            expect(response.body).toHaveProperty('sessionId');
            expect(response.body).toHaveProperty('requirements');
        });
    });
});
