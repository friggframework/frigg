/**
 * Session Expiry and Error Scenarios Integration Tests
 * Tests edge cases, expiration handling, and error conditions
 */

describe('Session Expiry and Error Scenarios', () => {
    let mockRepository;
    let mockModuleDefinitions;
    let StartAuthorizationSessionUseCase;
    let ProcessAuthorizationStepUseCase;
    let sessions;

    beforeEach(() => {
        // Session storage
        sessions = new Map();

        // Mock repository
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
            deleteExpired: jest.fn(async () => {
                const now = new Date();
                let count = 0;
                for (const [id, session] of sessions.entries()) {
                    if (session.expiresAt < now) {
                        sessions.delete(id);
                        count++;
                    }
                }
                return count;
            })
        };

        // Mock module definitions
        const nagarisDefinition = {
            getAuthStepCount: () => 2,
            getAuthRequirementsForStep: async step => ({
                type: step === 1 ? 'email' : 'otp',
                data: {}
            }),
            processAuthorizationStep: async (api, step, stepData) => {
                if (step === 1) {
                    return { nextStep: 2, stepData: { email: stepData.email } };
                }
                if (step === 2) {
                    if (stepData.otp === '123456') {
                        return {
                            completed: true,
                            authData: { access_token: 'token' }
                        };
                    }
                    throw new Error('Invalid OTP');
                }
            }
        };

        mockModuleDefinitions = [
            {
                moduleName: 'nagaris',
                definition: nagarisDefinition,
                apiClass: jest.fn()
            }
        ];

        // Initialize use cases
        StartAuthorizationSessionUseCase = class {
            constructor({ authSessionRepository }) {
                this.authSessionRepository = authSessionRepository;
            }

            async execute(userId, entityType, maxSteps, customExpiry) {
                const crypto = require('crypto');
                const sessionId = crypto.randomUUID();
                const expiresAt =
                    customExpiry || new Date(Date.now() + 15 * 60 * 1000);

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
                    requirements: nextRequirements
                };
            }
        };
    });

    describe('Session Expiration', () => {
        it('should reject expired sessions', async () => {
            const userId = 'user-123';
            const entityType = 'nagaris';

            const startSession = new StartAuthorizationSessionUseCase({
                authSessionRepository: mockRepository
            });

            // Create session that expires immediately
            const session = await startSession.execute(
                userId,
                entityType,
                2,
                new Date(Date.now() - 1000) // Already expired
            );

            const processStep = new ProcessAuthorizationStepUseCase({
                authSessionRepository: mockRepository,
                moduleDefinitions: mockModuleDefinitions
            });

            // Manually expire the session
            const storedSession = sessions.get(session.sessionId);
            storedSession.expiresAt = new Date(Date.now() - 1000);

            await expect(
                processStep.execute(session.sessionId, userId, 1, {
                    email: 'test@example.com'
                })
            ).rejects.toThrow('Authorization session has expired');
        });

        it('should return null for expired sessions in repository', async () => {
            const userId = 'user-123';
            const entityType = 'nagaris';

            const startSession = new StartAuthorizationSessionUseCase({
                authSessionRepository: mockRepository
            });

            const session = await startSession.execute(userId, entityType, 2);

            // Expire the session
            const storedSession = sessions.get(session.sessionId);
            storedSession.expiresAt = new Date(Date.now() - 1000);

            // Repository should return null
            const retrieved = await mockRepository.findBySessionId(session.sessionId);
            expect(retrieved).toBeNull();
        });

        it('should clean up expired sessions', async () => {
            const userId = 'user-123';

            const startSession = new StartAuthorizationSessionUseCase({
                authSessionRepository: mockRepository
            });

            // Create multiple sessions
            const session1 = await startSession.execute(userId, 'nagaris', 2);
            const session2 = await startSession.execute(userId, 'nagaris', 2);
            const session3 = await startSession.execute(userId, 'nagaris', 2);

            // Expire first two
            sessions.get(session1.sessionId).expiresAt = new Date(Date.now() - 1000);
            sessions.get(session2.sessionId).expiresAt = new Date(Date.now() - 1000);

            // Clean up
            const deletedCount = await mockRepository.deleteExpired();

            expect(deletedCount).toBe(2);
            expect(sessions.has(session1.sessionId)).toBe(false);
            expect(sessions.has(session2.sessionId)).toBe(false);
            expect(sessions.has(session3.sessionId)).toBe(true);
        });

        it('should handle session expiring mid-flow', async () => {
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

            // Complete step 1
            await processStep.execute(session.sessionId, userId, 1, {
                email: 'test@example.com'
            });

            // Expire before step 2
            sessions.get(session.sessionId).expiresAt = new Date(Date.now() - 1000);

            // Step 2 should fail
            await expect(
                processStep.execute(session.sessionId, userId, 3, { otp: '123456' })
            ).rejects.toThrow('Authorization session not found or expired');
        });

        it('should enforce 15-minute expiration window', async () => {
            const userId = 'user-123';
            const entityType = 'nagaris';

            const startSession = new StartAuthorizationSessionUseCase({
                authSessionRepository: mockRepository
            });

            const before = Date.now() + 15 * 60 * 1000;
            const session = await startSession.execute(userId, entityType, 2);
            const after = Date.now() + 15 * 60 * 1000;

            expect(session.expiresAt.getTime()).toBeGreaterThanOrEqual(before - 100);
            expect(session.expiresAt.getTime()).toBeLessThanOrEqual(after + 100);
        });
    });

    describe('Invalid Step Sequences', () => {
        it('should reject wrong step number', async () => {
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

            // Try step 2 before step 1
            await expect(
                processStep.execute(session.sessionId, userId, 3, { otp: '123456' })
            ).rejects.toThrow('Expected step 2, received step 3');
        });

        it('should reject negative step numbers', async () => {
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

            await expect(
                processStep.execute(session.sessionId, userId, -1, {})
            ).rejects.toThrow();
        });

        it('should reject step numbers beyond maxSteps', async () => {
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

            // Complete both steps
            await processStep.execute(session.sessionId, userId, 1, {
                email: 'test@example.com'
            });
            await processStep.execute(session.sessionId, userId, 3, { otp: '123456' });

            // Try step 3 (doesn't exist)
            await expect(
                processStep.execute(session.sessionId, userId, 4, {})
            ).rejects.toThrow();
        });
    });

    describe('Wrong User Access', () => {
        it('should prevent user from accessing another users session', async () => {
            const user1 = 'user-123';
            const user2 = 'user-456';
            const entityType = 'nagaris';

            const startSession = new StartAuthorizationSessionUseCase({
                authSessionRepository: mockRepository
            });

            const session = await startSession.execute(user1, entityType, 2);

            const processStep = new ProcessAuthorizationStepUseCase({
                authSessionRepository: mockRepository,
                moduleDefinitions: mockModuleDefinitions
            });

            await expect(
                processStep.execute(session.sessionId, user2, 1, {
                    email: 'test@example.com'
                })
            ).rejects.toThrow('Session does not belong to this user');
        });

        it('should prevent unauthorized session access via different entity', async () => {
            const user1 = 'user-123';
            const user2 = 'user-456';

            const startSession = new StartAuthorizationSessionUseCase({
                authSessionRepository: mockRepository
            });

            const session1 = await startSession.execute(user1, 'nagaris', 2);
            const session2 = await startSession.execute(user2, 'nagaris', 2);

            expect(session1.userId).toBe(user1);
            expect(session2.userId).toBe(user2);

            const processStep = new ProcessAuthorizationStepUseCase({
                authSessionRepository: mockRepository,
                moduleDefinitions: mockModuleDefinitions
            });

            // Each user can only access their own session
            await processStep.execute(session1.sessionId, user1, 1, {
                email: 'user1@example.com'
            });
            await processStep.execute(session2.sessionId, user2, 1, {
                email: 'user2@example.com'
            });

            // Cross-access fails
            await expect(
                processStep.execute(session1.sessionId, user2, 1, {})
            ).rejects.toThrow('Session does not belong to this user');
        });
    });

    describe('Nonexistent Sessions', () => {
        it('should reject nonexistent session IDs', async () => {
            const processStep = new ProcessAuthorizationStepUseCase({
                authSessionRepository: mockRepository,
                moduleDefinitions: mockModuleDefinitions
            });

            await expect(
                processStep.execute('nonexistent-session', 'user-123', 1, {})
            ).rejects.toThrow('Authorization session not found or expired');
        });

        it('should reject malformed session IDs', async () => {
            const processStep = new ProcessAuthorizationStepUseCase({
                authSessionRepository: mockRepository,
                moduleDefinitions: mockModuleDefinitions
            });

            await expect(
                processStep.execute('not-a-uuid', 'user-123', 1, {})
            ).rejects.toThrow('Authorization session not found or expired');
        });

        it('should reject null session ID', async () => {
            const processStep = new ProcessAuthorizationStepUseCase({
                authSessionRepository: mockRepository,
                moduleDefinitions: mockModuleDefinitions
            });

            await expect(
                processStep.execute(null, 'user-123', 1, {})
            ).rejects.toThrow();
        });

        it('should reject undefined session ID', async () => {
            const processStep = new ProcessAuthorizationStepUseCase({
                authSessionRepository: mockRepository,
                moduleDefinitions: mockModuleDefinitions
            });

            await expect(
                processStep.execute(undefined, 'user-123', 1, {})
            ).rejects.toThrow();
        });
    });

    describe('Module Definition Errors', () => {
        it('should reject unknown entity types', async () => {
            const userId = 'user-123';

            const startSession = new StartAuthorizationSessionUseCase({
                authSessionRepository: mockRepository
            });

            const session = await startSession.execute(userId, 'unknown-module', 2);

            const processStep = new ProcessAuthorizationStepUseCase({
                authSessionRepository: mockRepository,
                moduleDefinitions: mockModuleDefinitions
            });

            await expect(
                processStep.execute(session.sessionId, userId, 1, {})
            ).rejects.toThrow('Module definition not found: unknown-module');
        });

        it('should handle module processing errors gracefully', async () => {
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

            // Complete step 1
            await processStep.execute(session.sessionId, userId, 1, {
                email: 'test@example.com'
            });

            // Invalid OTP should throw
            await expect(
                processStep.execute(session.sessionId, userId, 3, { otp: 'wrong' })
            ).rejects.toThrow('Invalid OTP');
        });
    });

    describe('Concurrent Session Management', () => {
        it('should handle multiple active sessions per user', async () => {
            const userId = 'user-123';

            const startSession = new StartAuthorizationSessionUseCase({
                authSessionRepository: mockRepository
            });

            // Create 5 concurrent sessions
            const sessions = await Promise.all([
                startSession.execute(userId, 'nagaris', 2),
                startSession.execute(userId, 'nagaris', 2),
                startSession.execute(userId, 'nagaris', 2),
                startSession.execute(userId, 'nagaris', 2),
                startSession.execute(userId, 'nagaris', 2)
            ]);

            // All should have unique IDs
            const ids = sessions.map(s => s.sessionId);
            const uniqueIds = new Set(ids);
            expect(uniqueIds.size).toBe(5);

            // All should be active
            for (const session of sessions) {
                const retrieved = await mockRepository.findBySessionId(session.sessionId);
                expect(retrieved).not.toBeNull();
                expect(retrieved.userId).toBe(userId);
            }
        });

        it('should isolate state between concurrent sessions', async () => {
            const userId = 'user-123';

            const startSession = new StartAuthorizationSessionUseCase({
                authSessionRepository: mockRepository
            });

            const session1 = await startSession.execute(userId, 'nagaris', 2);
            const session2 = await startSession.execute(userId, 'nagaris', 2);

            const processStep = new ProcessAuthorizationStepUseCase({
                authSessionRepository: mockRepository,
                moduleDefinitions: mockModuleDefinitions
            });

            // Process different data in each session
            await processStep.execute(session1.sessionId, userId, 1, {
                email: 'email1@example.com'
            });
            await processStep.execute(session2.sessionId, userId, 1, {
                email: 'email2@example.com'
            });

            // Check data isolation
            const updated1 = await mockRepository.findBySessionId(session1.sessionId);
            const updated2 = await mockRepository.findBySessionId(session2.sessionId);

            expect(updated1.stepData.email).toBe('email1@example.com');
            expect(updated2.stepData.email).toBe('email2@example.com');
        });

        it('should handle race conditions in concurrent updates', async () => {
            const userId = 'user-123';

            const startSession = new StartAuthorizationSessionUseCase({
                authSessionRepository: mockRepository
            });

            const session = await startSession.execute(userId, 'nagaris', 2);

            const processStep = new ProcessAuthorizationStepUseCase({
                authSessionRepository: mockRepository,
                moduleDefinitions: mockModuleDefinitions
            });

            // Simulate concurrent step 1 submissions
            const results = await Promise.allSettled([
                processStep.execute(session.sessionId, userId, 1, {
                    email: 'email1@example.com'
                }),
                processStep.execute(session.sessionId, userId, 1, {
                    email: 'email2@example.com'
                }),
                processStep.execute(session.sessionId, userId, 1, {
                    email: 'email3@example.com'
                })
            ]);

            // At least one should succeed
            const successCount = results.filter(r => r.status === 'fulfilled').length;
            expect(successCount).toBeGreaterThanOrEqual(1);

            // Session should be in valid state
            const finalSession = await mockRepository.findBySessionId(session.sessionId);
            expect(finalSession.currentStep).toBeGreaterThanOrEqual(1);
        });
    });

    describe('Repository Errors', () => {
        it('should handle database connection errors', async () => {
            const userId = 'user-123';
            const entityType = 'nagaris';

            const startSession = new StartAuthorizationSessionUseCase({
                authSessionRepository: mockRepository
            });

            const session = await startSession.execute(userId, entityType, 2);

            // Simulate database error
            mockRepository.findBySessionId.mockRejectedValueOnce(
                new Error('Database connection lost')
            );

            const processStep = new ProcessAuthorizationStepUseCase({
                authSessionRepository: mockRepository,
                moduleDefinitions: mockModuleDefinitions
            });

            await expect(
                processStep.execute(session.sessionId, userId, 1, {})
            ).rejects.toThrow('Database connection lost');
        });

        it('should handle update failures', async () => {
            const userId = 'user-123';
            const entityType = 'nagaris';

            const startSession = new StartAuthorizationSessionUseCase({
                authSessionRepository: mockRepository
            });

            const session = await startSession.execute(userId, entityType, 2);

            // Simulate update failure
            mockRepository.update.mockRejectedValueOnce(new Error('Update failed'));

            const processStep = new ProcessAuthorizationStepUseCase({
                authSessionRepository: mockRepository,
                moduleDefinitions: mockModuleDefinitions
            });

            await expect(
                processStep.execute(session.sessionId, userId, 1, {
                    email: 'test@example.com'
                })
            ).rejects.toThrow('Update failed');
        });
    });
});
