/**
 * @file Module Endpoints Tests
 * @description Tests for the new v2 module API endpoints
 * 
 * Tests both single-step and multi-step authentication flows
 * Verifies DDD/Hexagonal architecture patterns
 */

const request = require('supertest');
const express = require('express');
const { createIntegrationRouter } = require('../../integration-router');

describe('Module Endpoints v2', () => {
    let app;
    let mockModuleDefinitions;
    let mockAuthSessionRepository;

    beforeEach(() => {
        // Mock module definitions
        mockModuleDefinitions = [
            {
                moduleName: 'test-service',
                definition: {
                    getDisplayName: () => 'Test Service',
                    getDescription: () => 'A test service for integration',
                    getAuthType: () => 'form',
                    getCapabilities: () => ['read', 'write'],
                    getRequiredScopes: () => ['scope1', 'scope2'],
                    getAuthStepCount: () => 1,
                    getAuthRequirementsForStep: jest.fn(),
                    processAuthorizationStep: jest.fn(),
                    testAuth: jest.fn()
                },
                apiClass: jest.fn()
            },
            {
                moduleName: 'multi-step-service',
                definition: {
                    getDisplayName: () => 'Multi-Step Service',
                    getDescription: () => 'A multi-step authentication service',
                    getAuthType: () => 'form',
                    getCapabilities: () => ['read'],
                    getRequiredScopes: () => ['scope1'],
                    getAuthStepCount: () => 2,
                    getAuthRequirementsForStep: jest.fn(),
                    processAuthorizationStep: jest.fn(),
                    testAuth: jest.fn()
                },
                apiClass: jest.fn()
            }
        ];

        // Mock auth session repository
        mockAuthSessionRepository = {
            findBySessionId: jest.fn(),
            create: jest.fn(),
            update: jest.fn()
        };

        // Create test app
        app = express();
        app.use(express.json());
        
        // Mock the integration classes and repositories
        const { integrations } = require('../../handlers/app-definition-loader');
        jest.doMock('../../handlers/app-definition-loader', () => ({
            loadAppDefinition: () => ({
                integrations: mockModuleDefinitions,
                userConfig: {}
            })
        }));

        // Mock repositories
        jest.doMock('../../modules/repositories/authorization-session-repository-factory', () => ({
            createAuthorizationSessionRepository: () => mockAuthSessionRepository
        }));

        const router = createIntegrationRouter();
        app.use('/', router);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('GET /api/modules', () => {
        it('should return list of available modules', async () => {
            const response = await request(app)
                .get('/api/modules')
                .set('Authorization', 'Bearer valid-token');

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('modules');
            expect(response.body.modules).toHaveLength(2);

            const testService = response.body.modules.find(m => m.moduleType === 'test-service');
            expect(testService).toMatchObject({
                moduleType: 'test-service',
                name: 'Test Service',
                description: 'A test service for integration',
                authType: 'form',
                isMultiStep: false,
                stepCount: 1,
                capabilities: ['read', 'write'],
                requiredScopes: ['scope1', 'scope2']
            });

            const multiStepService = response.body.modules.find(m => m.moduleType === 'multi-step-service');
            expect(multiStepService).toMatchObject({
                moduleType: 'multi-step-service',
                name: 'Multi-Step Service',
                description: 'A multi-step authentication service',
                authType: 'form',
                isMultiStep: true,
                stepCount: 2,
                capabilities: ['read'],
                requiredScopes: ['scope1']
            });
        });

        it('should require authentication', async () => {
            const response = await request(app)
                .get('/api/modules');

            expect(response.status).toBe(401);
        });
    });

    describe('GET /api/modules/:moduleType/authorization', () => {
        beforeEach(() => {
            mockModuleDefinitions[0].definition.getAuthRequirementsForStep.mockResolvedValue({
                type: 'form',
                data: {
                    jsonSchema: {
                        title: 'Connect Test Service',
                        type: 'object',
                        required: ['email'],
                        properties: {
                            email: {
                                type: 'string',
                                format: 'email',
                                title: 'Email Address'
                            }
                        }
                    },
                    uiSchema: {
                        email: {
                            'ui:placeholder': 'your.email@company.com'
                        }
                    }
                }
            });
        });

        it('should return authorization requirements for single-step module', async () => {
            const response = await request(app)
                .get('/api/modules/test-service/authorization')
                .set('Authorization', 'Bearer valid-token');

            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({
                type: 'form',
                step: 1,
                totalSteps: 1,
                isMultiStep: false,
                sessionId: expect.any(String)
            });
            expect(response.body.data.jsonSchema.title).toBe('Connect Test Service');
        });

        it('should return authorization requirements for multi-step module', async () => {
            mockModuleDefinitions[1].definition.getAuthRequirementsForStep.mockResolvedValue({
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
                                title: 'Email Address'
                            }
                        }
                    }
                }
            });

            const response = await request(app)
                .get('/api/modules/multi-step-service/authorization')
                .set('Authorization', 'Bearer valid-token');

            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({
                type: 'form',
                step: 1,
                totalSteps: 2,
                isMultiStep: true,
                sessionId: expect.any(String)
            });
        });

        it('should require sessionId for step > 1', async () => {
            const response = await request(app)
                .get('/api/modules/multi-step-service/authorization?step=2')
                .set('Authorization', 'Bearer valid-token');

            expect(response.status).toBe(400);
            expect(response.body.message).toContain('sessionId required for step > 1');
        });

        it('should validate step parameter', async () => {
            const response = await request(app)
                .get('/api/modules/test-service/authorization?step=0')
                .set('Authorization', 'Bearer valid-token');

            expect(response.status).toBe(400);
            expect(response.body.message).toContain('step must be >= 1');
        });

        it('should return 404 for unknown module', async () => {
            const response = await request(app)
                .get('/api/modules/unknown-service/authorization')
                .set('Authorization', 'Bearer valid-token');

            expect(response.status).toBe(400);
            expect(response.body.message).toContain('Unknown module type');
        });
    });

    describe('POST /api/modules/:moduleType/authorization', () => {
        beforeEach(() => {
            // Mock successful authorization callback
            const mockProcessAuthorizationCallback = require('../../modules/use-cases/process-authorization-callback');
            jest.spyOn(mockProcessAuthorizationCallback, 'ProcessAuthorizationCallback').mockImplementation(() => ({
                execute: jest.fn().mockResolvedValue({
                    entity: {
                        id: 'entity-123',
                        name: 'Test Entity',
                        moduleType: 'test-service'
                    }
                })
            }));
        });

        it('should handle single-step form submission', async () => {
            const response = await request(app)
                .post('/api/modules/test-service/authorization')
                .set('Authorization', 'Bearer valid-token')
                .send({
                    data: {
                        email: 'test@example.com'
                    }
                });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('entity');
            expect(response.body.entity.moduleType).toBe('test-service');
        });

        it('should handle multi-step form submission', async () => {
            // Mock session
            const mockSession = {
                userId: 'user-123',
                entityType: 'multi-step-service',
                currentStep: 1,
                maxSteps: 2,
                stepData: {},
                advanceStep: jest.fn(),
                markComplete: jest.fn(),
                isExpired: () => false
            };

            mockAuthSessionRepository.findBySessionId.mockResolvedValue(mockSession);

            // Mock step processing
            mockModuleDefinitions[1].definition.processAuthorizationStep.mockResolvedValue({
                nextStep: 2,
                stepData: { email: 'test@example.com' },
                message: 'OTP sent to email'
            });

            // Mock next step requirements
            mockModuleDefinitions[1].definition.getAuthRequirementsForStep.mockResolvedValue({
                type: 'form',
                data: {
                    jsonSchema: {
                        title: 'Step 2: Verification Code',
                        type: 'object',
                        required: ['otp'],
                        properties: {
                            otp: {
                                type: 'string',
                                title: 'Verification Code'
                            }
                        }
                    }
                }
            });

            const response = await request(app)
                .post('/api/modules/multi-step-service/authorization')
                .set('Authorization', 'Bearer valid-token')
                .send({
                    data: {
                        email: 'test@example.com'
                    },
                    step: 1,
                    sessionId: 'session-123'
                });

            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({
                step: 2,
                totalSteps: 2,
                sessionId: 'session-123',
                message: 'OTP sent to email'
            });
            expect(response.body.requirements.type).toBe('form');
        });

        it('should require data object', async () => {
            const response = await request(app)
                .post('/api/modules/test-service/authorization')
                .set('Authorization', 'Bearer valid-token')
                .send({});

            expect(response.status).toBe(400);
            expect(response.body.message).toContain('data object is required');
        });

        it('should validate step parameter', async () => {
            const response = await request(app)
                .post('/api/modules/test-service/authorization')
                .set('Authorization', 'Bearer valid-token')
                .send({
                    data: { email: 'test@example.com' },
                    step: 0
                });

            expect(response.status).toBe(400);
            expect(response.body.message).toContain('step must be >= 1');
        });

        it('should require sessionId for multi-step', async () => {
            const response = await request(app)
                .post('/api/modules/multi-step-service/authorization')
                .set('Authorization', 'Bearer valid-token')
                .send({
                    data: { email: 'test@example.com' },
                    step: 1
                });

            expect(response.status).toBe(400);
            expect(response.body.message).toContain('sessionId required for multi-step authorization');
        });
    });

    describe('GET /api/modules/:moduleType/test', () => {
        beforeEach(() => {
            const mockTestModuleAuth = require('../../modules/use-cases/test-module-auth');
            jest.spyOn(mockTestModuleAuth, 'TestModuleAuth').mockImplementation(() => ({
                execute: jest.fn().mockResolvedValue({
                    valid: true,
                    message: 'Authentication successful'
                })
            }));
        });

        it('should test module authentication', async () => {
            const response = await request(app)
                .get('/api/modules/test-service/test')
                .set('Authorization', 'Bearer valid-token');

            expect(response.status).toBe(200);
            expect(response.body).toMatchObject({
                valid: true,
                message: 'Authentication successful'
            });
        });

        it('should require authentication', async () => {
            const response = await request(app)
                .get('/api/modules/test-service/test');

            expect(response.status).toBe(401);
        });
    });
});
