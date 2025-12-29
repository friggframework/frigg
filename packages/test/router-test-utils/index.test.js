/**
 * @file Router Test Utilities - Unit Tests
 * @description Tests for the shared router test utilities
 */

const request = require('supertest');
const express = require('express');
const Boom = require('@hapi/boom');

const {
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
} = require('./index');

describe('Router Test Utilities', () => {
    describe('Mock Data Generators', () => {
        describe('createMockUser', () => {
            it('should create user with default values', () => {
                const user = createMockUser();
                expect(user.id).toBe('user-123');
                expect(user.username).toBe('testuser');
                expect(user.email).toBe('test@example.com');
            });

            it('should allow overriding values', () => {
                const user = createMockUser({ id: 'custom-id', username: 'custom' });
                expect(user.id).toBe('custom-id');
                expect(user.username).toBe('custom');
                expect(user.email).toBe('test@example.com'); // Default preserved
            });

            it('should include getId function', () => {
                const user = createMockUser({ id: 'test-id' });
                expect(user.getId()).toBe('test-id');
            });
        });

        describe('createMockCredential', () => {
            it('should create credential with default values', () => {
                const cred = createMockCredential();
                expect(cred.id).toBe('cred-123');
                expect(cred.type).toBe('hubspot');
                expect(cred.authIsValid).toBe(true);
                expect(cred.data.access_token).toBeDefined();
            });

            it('should allow overriding values', () => {
                const cred = createMockCredential({ type: 'salesforce', authIsValid: false });
                expect(cred.type).toBe('salesforce');
                expect(cred.authIsValid).toBe(false);
            });
        });

        describe('createMockEntity', () => {
            it('should create entity with default values', () => {
                const entity = createMockEntity();
                expect(entity.id).toBe('entity-123');
                expect(entity.userId).toBe('user-123');
                expect(entity.credentialId).toBe('cred-123');
            });
        });

        describe('createMockIntegration', () => {
            it('should create integration with default values', () => {
                const integration = createMockIntegration();
                expect(integration.id).toBe('integration-123');
                expect(integration.userId).toBe('user-123');
            });
        });

        describe('createMockModuleDefinition', () => {
            it('should create module definition with default values', () => {
                const def = createMockModuleDefinition();
                expect(def.moduleName).toBe('hubspot');
                expect(def.definition.getDisplayName()).toBe('HubSpot');
                expect(def.definition.getAuthType()).toBe('oauth2');
            });

            it('should allow customization', () => {
                const def = createMockModuleDefinition({
                    moduleName: 'custom',
                    displayName: 'Custom Service',
                    authType: 'api-key',
                });
                expect(def.moduleName).toBe('custom');
                expect(def.definition.getDisplayName()).toBe('Custom Service');
                expect(def.definition.getAuthType()).toBe('api-key');
            });
        });

        describe('mockData convenience object', () => {
            it('should provide pre-created instances', () => {
                expect(mockData.user).toBeDefined();
                expect(mockData.credential).toBeDefined();
                expect(mockData.entity).toBeDefined();
                expect(mockData.integration).toBeDefined();
            });
        });
    });

    describe('Mock Repository Factories', () => {
        describe('createMockUserRepository', () => {
            it('should create repository with all methods', () => {
                const repo = createMockUserRepository();
                expect(repo.findById).toBeDefined();
                expect(repo.findByToken).toBeDefined();
                expect(repo.getSessionToken).toBeDefined();
                expect(repo.findIndividualUserById).toBeDefined();
            });

            it('should have working mock implementations', async () => {
                const repo = createMockUserRepository();
                const user = await repo.findById('test');
                expect(user.id).toBe('user-123');
            });
        });

        describe('createMockCredentialRepository', () => {
            it('should create repository with all methods', () => {
                const repo = createMockCredentialRepository();
                expect(repo.findById).toBeDefined();
                expect(repo.findCredential).toBeDefined();
                expect(repo.deleteCredentialById).toBeDefined();
            });
        });

        describe('createMockRepositories', () => {
            it('should create all repositories at once', () => {
                const repos = createMockRepositories();
                expect(repos.userRepository).toBeDefined();
                expect(repos.credentialRepository).toBeDefined();
                expect(repos.moduleRepository).toBeDefined();
                expect(repos.integrationRepository).toBeDefined();
                expect(repos.authorizationSessionRepository).toBeDefined();
            });
        });
    });

    describe('Mock API/Factory Utilities', () => {
        describe('createMockApiRequester', () => {
            it('should create API requester with all methods', () => {
                const api = createMockApiRequester();
                expect(api.request).toBeDefined();
                expect(api._get).toBeDefined();
                expect(api._post).toBeDefined();
            });

            it('should have working request mock', async () => {
                const api = createMockApiRequester();
                const response = await api.request({ method: 'GET', path: '/test' });
                expect(response.status).toBe(200);
                expect(response.data.success).toBe(true);
            });
        });

        describe('createMockModuleFactory', () => {
            it('should create factory with getModuleInstance', () => {
                const factory = createMockModuleFactory();
                expect(factory.getModuleInstance).toBeDefined();
            });

            it('should return module with api property', async () => {
                const factory = createMockModuleFactory();
                const instance = await factory.getModuleInstance('entity-123', 'user-123');
                expect(instance.api).toBeDefined();
                expect(instance.api.request).toBeDefined();
            });
        });
    });

    describe('Express App Utilities', () => {
        describe('boomErrorHandler', () => {
            it('should handle Boom errors', async () => {
                const app = express();
                app.get('/error', (req, res, next) => {
                    next(Boom.notFound('Resource not found'));
                });
                app.use(boomErrorHandler);

                const response = await request(app).get('/error');
                expect(response.status).toBe(404);
                expect(response.body.error).toBe('Resource not found');
            });

            it('should handle non-Boom errors', async () => {
                const app = express();
                app.get('/error', () => {
                    throw new Error('Something went wrong');
                });
                app.use(boomErrorHandler);

                const response = await request(app).get('/error');
                expect(response.status).toBe(500);
                expect(response.body.error).toBe('Internal Server Error');
            });
        });

        describe('createAuthMiddleware', () => {
            it('should authenticate valid token', async () => {
                const app = express();
                app.use(createAuthMiddleware());
                app.get('/test', (req, res) => res.json({ user: req.user }));
                app.use(boomErrorHandler);

                const response = await request(app)
                    .get('/test')
                    .set('Authorization', 'Bearer valid-token');

                expect(response.status).toBe(200);
                expect(response.body.user.id).toBe('user-123');
            });

            it('should reject missing token', async () => {
                const app = express();
                app.use(createAuthMiddleware());
                app.get('/test', (req, res) => res.json({ user: req.user }));
                app.use(boomErrorHandler);

                const response = await request(app).get('/test');
                expect(response.status).toBe(401);
            });

            it('should reject invalid token', async () => {
                const app = express();
                app.use(createAuthMiddleware());
                app.get('/test', (req, res) => res.json({ user: req.user }));
                app.use(boomErrorHandler);

                const response = await request(app)
                    .get('/test')
                    .set('Authorization', 'Bearer invalid-token');

                expect(response.status).toBe(401);
            });

            it('should use custom valid token', async () => {
                const app = express();
                app.use(createAuthMiddleware({ validToken: 'custom-token' }));
                app.get('/test', (req, res) => res.json({ user: req.user }));
                app.use(boomErrorHandler);

                const response = await request(app)
                    .get('/test')
                    .set('Authorization', 'Bearer custom-token');

                expect(response.status).toBe(200);
            });
        });

        describe('createTestApp', () => {
            it('should create app with JSON parsing', async () => {
                const router = express.Router();
                router.post('/test', (req, res) => res.json(req.body));

                const app = createTestApp({ router, useAuth: false });

                const response = await request(app)
                    .post('/test')
                    .send({ data: 'test' });

                expect(response.status).toBe(200);
                expect(response.body.data).toBe('test');
            });

            it('should include auth middleware by default', async () => {
                const router = express.Router();
                router.get('/test', (req, res) => res.json({ ok: true }));

                const app = createTestApp({ router });

                const response = await request(app).get('/test');
                expect(response.status).toBe(401);
            });

            it('should mount router at custom base path', async () => {
                const router = express.Router();
                router.get('/resource', (req, res) => res.json({ ok: true }));

                const app = createTestApp({ router, basePath: '/api', useAuth: false });

                const response = await request(app).get('/api/resource');
                expect(response.status).toBe(200);
            });

            it('should include Boom error handler', async () => {
                const router = express.Router();
                router.get('/error', (req, res, next) => {
                    next(Boom.badRequest('Invalid input'));
                });

                const app = createTestApp({ router, useAuth: false });

                const response = await request(app).get('/error');
                expect(response.status).toBe(400);
                expect(response.body.error).toBe('Invalid input');
            });
        });
    });

    describe('Config Mocks', () => {
        describe('databaseConfigMock', () => {
            it('should have expected properties', () => {
                expect(databaseConfigMock.DB_TYPE).toBe('mongodb');
                expect(databaseConfigMock.getDatabaseType()).toBe('mongodb');
            });
        });

        describe('createMockAppDefinition', () => {
            it('should create app definition with defaults', () => {
                const def = createMockAppDefinition();
                expect(def.integrations).toBeDefined();
                expect(def.integrations.length).toBeGreaterThan(0);
                expect(def.userConfig).toBeDefined();
            });

            it('should allow customization', () => {
                const def = createMockAppDefinition({
                    userConfig: { usePassword: false },
                });
                expect(def.userConfig.usePassword).toBe(false);
            });
        });
    });
});
