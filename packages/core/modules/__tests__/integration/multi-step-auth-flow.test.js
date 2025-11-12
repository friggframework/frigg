/**
 * Multi-Step Authentication Flow Integration Tests
 * Tests complete workflows from start to finish
 */

describe('Multi-Step Authentication Flow Integration', () => {
    let mockRepository;
    let mockModuleDefinitions;
    let StartAuthorizationSessionUseCase;
    let ProcessAuthorizationStepUseCase;
    let GetAuthorizationRequirementsUseCase;
    let sessions;

    beforeEach(() => {
        // Session storage
        sessions = new Map();

        // Mock repository with in-memory storage
        mockRepository = {
            create: jest.fn(async session => {
                sessions.set(session.sessionId, { ...session });
                return session;
            }),
            findBySessionId: jest.fn(async sessionId => {
                const session = sessions.get(sessionId);
                if (!session) return null;
                if (session.expiresAt < new Date()) return null;
                return {
                    ...session,
                    isExpired: () => session.expiresAt < new Date(),
                    advanceStep: function (data) {
                        this.currentStep += 1;
                        this.stepData = { ...this.stepData, ...data };
                    },
                    markComplete: function () {
                        this.completed = true;
                    }
                };
            }),
            update: jest.fn(async session => {
                sessions.set(session.sessionId, { ...session });
                return session;
            }),
            findActiveSession: jest.fn(),
            deleteExpired: jest.fn()
        };

        // Mock Nagaris module (2-step: email → OTP)
        const nagarisDefinition = {
            getAuthStepCount: () => 2,
            getAuthRequirementsForStep: async step => {
                if (step === 1) {
                    return {
                        type: 'email',
                        data: {
                            jsonSchema: {
                                title: 'Nagaris Authentication',
                                type: 'object',
                                required: ['email'],
                                properties: {
                                    email: { type: 'string', format: 'email' }
                                }
                            }
                        }
                    };
                }
                if (step === 2) {
                    return {
                        type: 'otp',
                        data: {
                            jsonSchema: {
                                title: 'Verify OTP',
                                type: 'object',
                                required: ['otp'],
                                properties: {
                                    email: { type: 'string', readOnly: true },
                                    otp: { type: 'string', minLength: 6 }
                                }
                            }
                        }
                    };
                }
                throw new Error(`Step ${step} not defined`);
            },
            processAuthorizationStep: async (api, step, stepData, sessionData) => {
                if (step === 1) {
                    // Simulate OTP request
                    return {
                        nextStep: 2,
                        stepData: { email: stepData.email },
                        message: 'OTP sent to your email'
                    };
                }
                if (step === 2) {
                    // Simulate OTP verification
                    if (stepData.otp === '123456') {
                        return {
                            completed: true,
                            authData: {
                                access_token: 'nagaris_token_123',
                                refresh_token: 'nagaris_refresh_456',
                                user: {
                                    id: 'nagaris_user_789',
                                    email: sessionData.email
                                }
                            }
                        };
                    }
                    throw new Error('Invalid OTP');
                }
                throw new Error(`Step ${step} not implemented`);
            }
        };

        // Mock HubSpot module (single-step OAuth2)
        const hubspotDefinition = {
            getAuthStepCount: () => 1,
            getAuthRequirementsForStep: async step => ({
                type: 'oauth2',
                url: 'https://app.hubspot.com/oauth/authorize'
            }),
            processAuthorizationStep: async (api, step, stepData) => ({
                completed: true,
                authData: {
                    access_token: 'hubspot_token_123',
                    refresh_token: 'hubspot_refresh_456'
                }
            })
        };

        mockModuleDefinitions = [
            {
                moduleName: 'nagaris',
                definition: nagarisDefinition,
                apiClass: jest.fn()
            },
            {
                moduleName: 'hubspot',
                definition: hubspotDefinition,
                apiClass: jest.fn()
            }
        ];

        // Initialize use cases
        StartAuthorizationSessionUseCase = class {
            constructor({ authSessionRepository }) {
                this.authSessionRepository = authSessionRepository;
            }

            async execute(userId, entityType, maxSteps) {
                const crypto = require('crypto');
                const sessionId = crypto.randomUUID();
                const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

                const session = {
                    sessionId,
                    userId,
                    entityType,
                    currentStep: 1,
                    maxSteps,
                    stepData: {},
                    expiresAt,
                    completed: false
                };

                return await this.authSessionRepository.create(session);
            }
        };

        ProcessAuthorizationStepUseCase = class {
            constructor({ authSessionRepository, moduleDefinitions }) {
                this.authSessionRepository = authSessionRepository;
                this.moduleDefinitions = moduleDefinitions;
            }

            async execute(sessionId, userId, step, stepData) {
                const session = await this.authSessionRepository.findBySessionId(sessionId);

                if (!session) {
                    throw new Error('Authorization session not found or expired');
                }

                if (session.userId !== userId) {
                    throw new Error('Session does not belong to this user');
                }

                if (session.isExpired()) {
                    throw new Error('Authorization session has expired');
                }

                if (session.currentStep + 1 !== step && step !== 1) {
                    throw new Error(
                        `Expected step ${session.currentStep + 1}, received step ${step}`
                    );
                }

                const moduleDefinition = this.moduleDefinitions.find(
                    def => def.moduleName === session.entityType
                );

                if (!moduleDefinition) {
                    throw new Error(`Module definition not found: ${session.entityType}`);
                }

                const ModuleDefinition = moduleDefinition.definition;
                const ApiClass = moduleDefinition.apiClass;
                const api = new ApiClass({ userId });

                const result = await ModuleDefinition.processAuthorizationStep(
                    api,
                    step,
                    stepData,
                    session.stepData
                );

                if (result.completed) {
                    session.markComplete();
                    await this.authSessionRepository.update(session);

                    return {
                        completed: true,
                        authData: result.authData,
                        sessionId
                    };
                }

                session.advanceStep(result.stepData || {});
                await this.authSessionRepository.update(session);

                const nextRequirements = await ModuleDefinition.getAuthRequirementsForStep(
                    result.nextStep
                );

                return {
                    nextStep: result.nextStep,
                    totalSteps: session.maxSteps,
                    sessionId,
                    requirements: nextRequirements,
                    message: result.message
                };
            }
        };

        GetAuthorizationRequirementsUseCase = class {
            constructor({ moduleDefinitions }) {
                this.moduleDefinitions = moduleDefinitions;
            }

            async execute(entityType, step = 1) {
                const moduleDefinition = this.moduleDefinitions.find(
                    def => def.moduleName === entityType
                );

                if (!moduleDefinition) {
                    throw new Error(`Module definition not found: ${entityType}`);
                }

                const ModuleDefinition = moduleDefinition.definition;

                const stepCount = ModuleDefinition.getAuthStepCount
                    ? ModuleDefinition.getAuthStepCount()
                    : 1;

                const requirements = await ModuleDefinition.getAuthRequirementsForStep(step);

                return {
                    ...requirements,
                    step,
                    totalSteps: stepCount,
                    isMultiStep: stepCount > 1
                };
            }
        };
    });

    describe('Complete 2-Step Nagaris OTP Flow', () => {
        it('should complete full email → OTP → entity creation flow', async () => {
            const userId = 'user-123';
            const entityType = 'nagaris';

            // Step 0: Get requirements
            const getRequirements = new GetAuthorizationRequirementsUseCase({
                moduleDefinitions: mockModuleDefinitions
            });

            const requirements = await getRequirements.execute(entityType, 1);

            expect(requirements.isMultiStep).toBe(true);
            expect(requirements.totalSteps).toBe(2);
            expect(requirements.type).toBe('email');

            // Step 1: Start session and submit email
            const startSession = new StartAuthorizationSessionUseCase({
                authSessionRepository: mockRepository
            });

            const session = await startSession.execute(userId, entityType, 2);

            expect(session.sessionId).toBeDefined();
            expect(session.currentStep).toBe(1);
            expect(session.completed).toBe(false);

            // Step 2: Process email submission
            const processStep = new ProcessAuthorizationStepUseCase({
                authSessionRepository: mockRepository,
                moduleDefinitions: mockModuleDefinitions
            });

            const step1Result = await processStep.execute(
                session.sessionId,
                userId,
                1,
                { email: 'test@example.com' }
            );

            expect(step1Result.nextStep).toBe(2);
            expect(step1Result.message).toBe('OTP sent to your email');
            expect(step1Result.requirements.type).toBe('otp');

            // Step 3: Verify stored session data
            const updatedSession = await mockRepository.findBySessionId(session.sessionId);
            expect(updatedSession.currentStep).toBe(2);
            expect(updatedSession.stepData.email).toBe('test@example.com');

            // Step 4: Submit OTP
            const step2Result = await processStep.execute(
                session.sessionId,
                userId,
                3,
                { otp: '123456' }
            );

            expect(step2Result.completed).toBe(true);
            expect(step2Result.authData.access_token).toBe('nagaris_token_123');
            expect(step2Result.authData.user.email).toBe('test@example.com');

            // Step 5: Verify session is completed
            const completedSession = await mockRepository.findBySessionId(session.sessionId);
            expect(completedSession.completed).toBe(true);
        });

        it('should reject invalid OTP', async () => {
            const userId = 'user-123';
            const entityType = 'nagaris';

            const startSession = new StartAuthorizationSessionUseCase({
                authSessionRepository: mockRepository
            });

            const session = await startSession.execute(userId, entityType, 2);

            const processStep = new ProcessAuthorizationStepUseCase({
                authSessionRepository: mockRepository,
                moduleDefinitions: mockModuleDefinitions
            });

            // Submit email
            await processStep.execute(session.sessionId, userId, 1, {
                email: 'test@example.com'
            });

            // Submit wrong OTP
            await expect(
                processStep.execute(session.sessionId, userId, 3, { otp: '000000' })
            ).rejects.toThrow('Invalid OTP');
        });

        it('should accumulate stepData across workflow', async () => {
            const userId = 'user-123';
            const entityType = 'nagaris';

            const startSession = new StartAuthorizationSessionUseCase({
                authSessionRepository: mockRepository
            });

            const session = await startSession.execute(userId, entityType, 2);

            const processStep = new ProcessAuthorizationStepUseCase({
                authSessionRepository: mockRepository,
                moduleDefinitions: mockModuleDefinitions
            });

            // Step 1: Email
            await processStep.execute(session.sessionId, userId, 1, {
                email: 'test@example.com'
            });

            // Check session data
            const sessionAfterStep1 = await mockRepository.findBySessionId(session.sessionId);
            expect(sessionAfterStep1.stepData).toEqual({
                email: 'test@example.com'
            });

            // Step 2: OTP (should still have email)
            await processStep.execute(session.sessionId, userId, 3, {
                otp: '123456'
            });

            const sessionAfterStep2 = await mockRepository.findBySessionId(session.sessionId);
            expect(sessionAfterStep2.stepData.email).toBe('test@example.com');
        });
    });

    describe('Single-Step Backward Compatibility', () => {
        it('should handle single-step OAuth2 flow', async () => {
            const userId = 'user-123';
            const entityType = 'hubspot';

            // Get requirements
            const getRequirements = new GetAuthorizationRequirementsUseCase({
                moduleDefinitions: mockModuleDefinitions
            });

            const requirements = await getRequirements.execute(entityType, 1);

            expect(requirements.isMultiStep).toBe(false);
            expect(requirements.totalSteps).toBe(1);
            expect(requirements.type).toBe('oauth2');

            // Start and complete in one step
            const startSession = new StartAuthorizationSessionUseCase({
                authSessionRepository: mockRepository
            });

            const session = await startSession.execute(userId, entityType, 1);

            const processStep = new ProcessAuthorizationStepUseCase({
                authSessionRepository: mockRepository,
                moduleDefinitions: mockModuleDefinitions
            });

            const result = await processStep.execute(
                session.sessionId,
                userId,
                1,
                { code: 'oauth_code_123' }
            );

            expect(result.completed).toBe(true);
            expect(result.authData.access_token).toBe('hubspot_token_123');
        });

        it('should mark single-step session as complete immediately', async () => {
            const userId = 'user-123';
            const entityType = 'hubspot';

            const startSession = new StartAuthorizationSessionUseCase({
                authSessionRepository: mockRepository
            });

            const session = await startSession.execute(userId, entityType, 1);

            const processStep = new ProcessAuthorizationStepUseCase({
                authSessionRepository: mockRepository,
                moduleDefinitions: mockModuleDefinitions
            });

            await processStep.execute(session.sessionId, userId, 1, {});

            const completedSession = await mockRepository.findBySessionId(session.sessionId);
            expect(completedSession.completed).toBe(true);
        });
    });

    describe('Session State Management', () => {
        it('should prevent processing completed sessions', async () => {
            const userId = 'user-123';
            const entityType = 'nagaris';

            const startSession = new StartAuthorizationSessionUseCase({
                authSessionRepository: mockRepository
            });

            const session = await startSession.execute(userId, entityType, 2);

            const processStep = new ProcessAuthorizationStepUseCase({
                authSessionRepository: mockRepository,
                moduleDefinitions: mockModuleDefinitions
            });

            // Complete the flow
            await processStep.execute(session.sessionId, userId, 1, {
                email: 'test@example.com'
            });
            await processStep.execute(session.sessionId, userId, 3, { otp: '123456' });

            // Try to restart - should fail
            await expect(
                processStep.execute(session.sessionId, userId, 1, {
                    email: 'new@example.com'
                })
            ).rejects.toThrow();
        });

        it('should maintain session isolation between users', async () => {
            const user1 = 'user-123';
            const user2 = 'user-456';
            const entityType = 'nagaris';

            const startSession = new StartAuthorizationSessionUseCase({
                authSessionRepository: mockRepository
            });

            const session1 = await startSession.execute(user1, entityType, 2);
            const session2 = await startSession.execute(user2, entityType, 2);

            expect(session1.sessionId).not.toBe(session2.sessionId);

            const processStep = new ProcessAuthorizationStepUseCase({
                authSessionRepository: mockRepository,
                moduleDefinitions: mockModuleDefinitions
            });

            // User 1 cannot access User 2's session
            await expect(
                processStep.execute(session2.sessionId, user1, 1, {})
            ).rejects.toThrow('Session does not belong to this user');
        });

        it('should allow multiple concurrent sessions for same user', async () => {
            const userId = 'user-123';

            const startSession = new StartAuthorizationSessionUseCase({
                authSessionRepository: mockRepository
            });

            const nagarisSession = await startSession.execute(userId, 'nagaris', 2);
            const hubspotSession = await startSession.execute(userId, 'hubspot', 1);

            expect(nagarisSession.sessionId).not.toBe(hubspotSession.sessionId);
            expect(nagarisSession.entityType).toBe('nagaris');
            expect(hubspotSession.entityType).toBe('hubspot');

            // Both should be processable
            const processStep = new ProcessAuthorizationStepUseCase({
                authSessionRepository: mockRepository,
                moduleDefinitions: mockModuleDefinitions
            });

            await processStep.execute(nagarisSession.sessionId, userId, 1, {
                email: 'test@example.com'
            });
            await processStep.execute(hubspotSession.sessionId, userId, 1, {});

            const updatedNagaris = await mockRepository.findBySessionId(
                nagarisSession.sessionId
            );
            const updatedHubspot = await mockRepository.findBySessionId(
                hubspotSession.sessionId
            );

            expect(updatedNagaris.currentStep).toBe(2);
            expect(updatedHubspot.completed).toBe(true);
        });
    });

    describe('Error Recovery', () => {
        it('should allow retry after failed step', async () => {
            const userId = 'user-123';
            const entityType = 'nagaris';

            const startSession = new StartAuthorizationSessionUseCase({
                authSessionRepository: mockRepository
            });

            const session = await startSession.execute(userId, entityType, 2);

            const processStep = new ProcessAuthorizationStepUseCase({
                authSessionRepository: mockRepository,
                moduleDefinitions: mockModuleDefinitions
            });

            // Step 1: Email
            await processStep.execute(session.sessionId, userId, 1, {
                email: 'test@example.com'
            });

            // Step 2: Wrong OTP (first attempt)
            await expect(
                processStep.execute(session.sessionId, userId, 3, { otp: '000000' })
            ).rejects.toThrow('Invalid OTP');

            // Step 2: Correct OTP (retry)
            const result = await processStep.execute(session.sessionId, userId, 3, {
                otp: '123456'
            });

            expect(result.completed).toBe(true);
        });

        it('should maintain session state after error', async () => {
            const userId = 'user-123';
            const entityType = 'nagaris';

            const startSession = new StartAuthorizationSessionUseCase({
                authSessionRepository: mockRepository
            });

            const session = await startSession.execute(userId, entityType, 2);

            const processStep = new ProcessAuthorizationStepUseCase({
                authSessionRepository: mockRepository,
                moduleDefinitions: mockModuleDefinitions
            });

            await processStep.execute(session.sessionId, userId, 1, {
                email: 'test@example.com'
            });

            // Failed OTP
            await expect(
                processStep.execute(session.sessionId, userId, 3, { otp: '000000' })
            ).rejects.toThrow();

            // Verify session still has email
            const sessionAfterError = await mockRepository.findBySessionId(session.sessionId);
            expect(sessionAfterError.stepData.email).toBe('test@example.com');
            expect(sessionAfterError.currentStep).toBe(2);
            expect(sessionAfterError.completed).toBe(false);
        });
    });

    describe('Step Sequence Validation', () => {
        it('should prevent skipping steps', async () => {
            const userId = 'user-123';
            const entityType = 'nagaris';

            const startSession = new StartAuthorizationSessionUseCase({
                authSessionRepository: mockRepository
            });

            const session = await startSession.execute(userId, entityType, 2);

            const processStep = new ProcessAuthorizationStepUseCase({
                authSessionRepository: mockRepository,
                moduleDefinitions: mockModuleDefinitions
            });

            // Try to skip to step 2 without completing step 1
            await expect(
                processStep.execute(session.sessionId, userId, 3, { otp: '123456' })
            ).rejects.toThrow('Expected step 2, received step 3');
        });

        it('should enforce correct step order', async () => {
            const userId = 'user-123';
            const entityType = 'nagaris';

            const startSession = new StartAuthorizationSessionUseCase({
                authSessionRepository: mockRepository
            });

            const session = await startSession.execute(userId, entityType, 2);

            const processStep = new ProcessAuthorizationStepUseCase({
                authSessionRepository: mockRepository,
                moduleDefinitions: mockModuleDefinitions
            });

            // Step 1
            await processStep.execute(session.sessionId, userId, 1, {
                email: 'test@example.com'
            });

            // Try to go back to step 1
            await expect(
                processStep.execute(session.sessionId, userId, 1, {
                    email: 'new@example.com'
                })
            ).rejects.toThrow();
        });
    });
});
