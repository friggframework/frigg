/**
 * ProcessAuthorizationStepUseCase Unit Tests
 * Tests step processing, validation, and workflow orchestration
 */

describe('ProcessAuthorizationStepUseCase', () => {
    let useCase;
    let mockRepository;
    let mockModuleDefinitions;
    let mockSession;

    beforeEach(() => {
        // Mock session
        mockSession = {
            sessionId: 'test-session-123',
            userId: 'user-123',
            entityType: 'nagaris',
            currentStep: 1,
            maxSteps: 2,
            stepData: {},
            expiresAt: new Date(Date.now() + 15 * 60 * 1000),
            completed: false,
            isExpired: jest.fn().mockReturnValue(false),
            advanceStep: jest.fn(function (data) {
                this.currentStep += 1;
                this.stepData = { ...this.stepData, ...data };
            }),
            markComplete: jest.fn(function () {
                this.completed = true;
            }),
        };

        // Mock repository
        mockRepository = {
            findBySessionId: jest.fn(),
            update: jest.fn(),
        };

        // Mock module definitions
        const mockNagarisDefinition = {
            processAuthorizationStep: jest.fn(),
            getAuthRequirementsForStep: jest.fn(),
        };

        const mockNagarisApi = jest.fn();

        mockModuleDefinitions = [
            {
                moduleName: 'nagaris',
                definition: mockNagarisDefinition,
                apiClass: mockNagarisApi,
            },
        ];

        // Mock use case
        class ProcessAuthorizationStepUseCase {
            constructor({ authSessionRepository, moduleDefinitions }) {
                this.authSessionRepository = authSessionRepository;
                this.moduleDefinitions = moduleDefinitions;
            }

            async execute(sessionId, userId, step, stepData) {
                const session =
                    await this.authSessionRepository.findBySessionId(sessionId);

                if (!session) {
                    throw new Error(
                        'Authorization session not found or expired'
                    );
                }

                if (session.userId !== userId) {
                    throw new Error('Session does not belong to this user');
                }

                if (session.isExpired()) {
                    throw new Error('Authorization session has expired');
                }

                if (session.currentStep + 1 !== step && step !== 1) {
                    throw new Error(
                        `Expected step ${
                            session.currentStep + 1
                        }, received step ${step}`
                    );
                }

                const moduleDefinition = this.moduleDefinitions.find(
                    (def) => def.moduleName === session.entityType
                );

                if (!moduleDefinition) {
                    throw new Error(
                        `Module definition not found: ${session.entityType}`
                    );
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
                        sessionId,
                    };
                }

                session.advanceStep(result.stepData || {});
                await this.authSessionRepository.update(session);

                const nextRequirements =
                    await ModuleDefinition.getAuthRequirementsForStep(
                        result.nextStep
                    );

                return {
                    nextStep: result.nextStep,
                    totalSteps: session.maxSteps,
                    sessionId,
                    requirements: nextRequirements,
                    message: result.message,
                };
            }
        }

        useCase = new ProcessAuthorizationStepUseCase({
            authSessionRepository: mockRepository,
            moduleDefinitions: mockModuleDefinitions,
        });
    });

    describe('Session Validation', () => {
        it('should throw error when session not found', async () => {
            mockRepository.findBySessionId.mockResolvedValue(null);

            await expect(
                useCase.execute('nonexistent', 'user-123', 1, {})
            ).rejects.toThrow('Authorization session not found or expired');
        });

        it('should throw error when session belongs to different user', async () => {
            mockRepository.findBySessionId.mockResolvedValue(mockSession);

            await expect(
                useCase.execute('test-session-123', 'different-user', 1, {})
            ).rejects.toThrow('Session does not belong to this user');
        });

        it('should throw error when session is expired', async () => {
            mockSession.isExpired.mockReturnValue(true);
            mockRepository.findBySessionId.mockResolvedValue(mockSession);

            await expect(
                useCase.execute('test-session-123', 'user-123', 1, {})
            ).rejects.toThrow('Authorization session has expired');
        });

        it('should throw error when step is out of sequence', async () => {
            mockRepository.findBySessionId.mockResolvedValue(mockSession);

            await expect(
                useCase.execute('test-session-123', 'user-123', 3, {})
            ).rejects.toThrow('Expected step 2, received step 3');
        });

        it('should allow step 1 even if not in sequence (restart)', async () => {
            mockSession.currentStep = 2;
            mockRepository.findBySessionId.mockResolvedValue(mockSession);
            mockRepository.update.mockResolvedValue(mockSession);

            const mockDefinition = mockModuleDefinitions[0].definition;
            mockDefinition.processAuthorizationStep.mockResolvedValue({
                nextStep: 2,
                stepData: { email: 'test@example.com' },
            });
            mockDefinition.getAuthRequirementsForStep.mockResolvedValue({
                type: 'otp',
            });

            await useCase.execute('test-session-123', 'user-123', 1, {
                email: 'test@example.com',
            });

            expect(mockDefinition.processAuthorizationStep).toHaveBeenCalled();
        });
    });

    describe('Module Definition Integration', () => {
        it('should throw error when module definition not found', async () => {
            mockSession.entityType = 'unknown-module';
            mockRepository.findBySessionId.mockResolvedValue(mockSession);

            await expect(
                useCase.execute('test-session-123', 'user-123', 1, {})
            ).rejects.toThrow('Module definition not found: unknown-module');
        });

        it('should call module processAuthorizationStep with correct parameters', async () => {
            mockRepository.findBySessionId.mockResolvedValue(mockSession);
            mockRepository.update.mockResolvedValue(mockSession);

            const mockDefinition = mockModuleDefinitions[0].definition;
            mockDefinition.processAuthorizationStep.mockResolvedValue({
                nextStep: 2,
                stepData: { email: 'test@example.com' },
            });
            mockDefinition.getAuthRequirementsForStep.mockResolvedValue({
                type: 'otp',
            });

            const stepData = { email: 'test@example.com' };
            await useCase.execute('test-session-123', 'user-123', 1, stepData);

            expect(
                mockDefinition.processAuthorizationStep
            ).toHaveBeenCalledWith(
                expect.any(Object), // API instance
                1,
                stepData,
                {} // session.stepData
            );
        });

        it('should create API instance with correct userId', async () => {
            mockRepository.findBySessionId.mockResolvedValue(mockSession);
            mockRepository.update.mockResolvedValue(mockSession);

            const mockApiClass = jest.fn();
            mockModuleDefinitions[0].apiClass = mockApiClass;

            const mockDefinition = mockModuleDefinitions[0].definition;
            mockDefinition.processAuthorizationStep.mockResolvedValue({
                nextStep: 2,
                stepData: {},
            });
            mockDefinition.getAuthRequirementsForStep.mockResolvedValue({});

            await useCase.execute('test-session-123', 'user-123', 1, {});

            expect(mockApiClass).toHaveBeenCalledWith({ userId: 'user-123' });
        });
    });

    describe('Intermediate Steps', () => {
        it('should advance session and return next requirements', async () => {
            mockRepository.findBySessionId.mockResolvedValue(mockSession);
            mockRepository.update.mockResolvedValue(mockSession);

            const mockDefinition = mockModuleDefinitions[0].definition;
            mockDefinition.processAuthorizationStep.mockResolvedValue({
                nextStep: 2,
                stepData: { email: 'test@example.com' },
            });
            mockDefinition.getAuthRequirementsForStep.mockResolvedValue({
                type: 'otp',
                data: { jsonSchema: {} },
            });

            const result = await useCase.execute(
                'test-session-123',
                'user-123',
                1,
                { email: 'test@example.com' }
            );

            expect(mockSession.advanceStep).toHaveBeenCalledWith({
                email: 'test@example.com',
            });
            expect(mockRepository.update).toHaveBeenCalledWith(mockSession);
            expect(result).toEqual({
                nextStep: 2,
                totalSteps: 2,
                sessionId: 'test-session-123',
                requirements: { type: 'otp', data: { jsonSchema: {} } },
                message: undefined,
            });
        });

        it('should include message in response if provided', async () => {
            mockRepository.findBySessionId.mockResolvedValue(mockSession);
            mockRepository.update.mockResolvedValue(mockSession);

            const mockDefinition = mockModuleDefinitions[0].definition;
            mockDefinition.processAuthorizationStep.mockResolvedValue({
                nextStep: 2,
                stepData: { email: 'test@example.com' },
                message: 'OTP sent to your email',
            });
            mockDefinition.getAuthRequirementsForStep.mockResolvedValue({
                type: 'otp',
            });

            const result = await useCase.execute(
                'test-session-123',
                'user-123',
                1,
                { email: 'test@example.com' }
            );

            expect(result.message).toBe('OTP sent to your email');
        });

        it('should merge stepData from previous steps', async () => {
            mockSession.stepData = { email: 'test@example.com' };
            mockRepository.findBySessionId.mockResolvedValue(mockSession);
            mockRepository.update.mockResolvedValue(mockSession);

            const mockDefinition = mockModuleDefinitions[0].definition;
            mockDefinition.processAuthorizationStep.mockResolvedValue({
                nextStep: 3,
                stepData: { otp: '123456' },
            });
            mockDefinition.getAuthRequirementsForStep.mockResolvedValue({});

            await useCase.execute('test-session-123', 'user-123', 2, {
                otp: '123456',
            });

            expect(mockSession.advanceStep).toHaveBeenCalledWith({
                otp: '123456',
            });
        });

        it('should pass accumulated stepData to module', async () => {
            mockSession.currentStep = 2;
            mockSession.stepData = { email: 'test@example.com' };
            mockRepository.findBySessionId.mockResolvedValue(mockSession);
            mockRepository.update.mockResolvedValue(mockSession);

            const mockDefinition = mockModuleDefinitions[0].definition;
            mockDefinition.processAuthorizationStep.mockResolvedValue({
                completed: true,
                authData: {},
            });

            await useCase.execute('test-session-123', 'user-123', 3, {
                otp: '123456',
            });

            expect(
                mockDefinition.processAuthorizationStep
            ).toHaveBeenCalledWith(
                expect.any(Object),
                3,
                { otp: '123456' },
                { email: 'test@example.com' }
            );
        });
    });

    describe('Completion', () => {
        it('should mark session complete when step returns completed', async () => {
            mockRepository.findBySessionId.mockResolvedValue(mockSession);
            mockRepository.update.mockResolvedValue(mockSession);

            const mockDefinition = mockModuleDefinitions[0].definition;
            mockDefinition.processAuthorizationStep.mockResolvedValue({
                completed: true,
                authData: { access_token: 'token123' },
            });

            await useCase.execute('test-session-123', 'user-123', 1, {});

            expect(mockSession.markComplete).toHaveBeenCalled();
            expect(mockRepository.update).toHaveBeenCalledWith(mockSession);
        });

        it('should return completed status with authData', async () => {
            mockRepository.findBySessionId.mockResolvedValue(mockSession);
            mockRepository.update.mockResolvedValue(mockSession);

            const authData = {
                access_token: 'token123',
                refresh_token: 'refresh456',
                user: { id: '789', email: 'test@example.com' },
            };

            const mockDefinition = mockModuleDefinitions[0].definition;
            mockDefinition.processAuthorizationStep.mockResolvedValue({
                completed: true,
                authData,
            });

            const result = await useCase.execute(
                'test-session-123',
                'user-123',
                1,
                {}
            );

            expect(result).toEqual({
                completed: true,
                authData,
                sessionId: 'test-session-123',
            });
        });

        it('should not fetch next requirements when completed', async () => {
            mockRepository.findBySessionId.mockResolvedValue(mockSession);
            mockRepository.update.mockResolvedValue(mockSession);

            const mockDefinition = mockModuleDefinitions[0].definition;
            mockDefinition.processAuthorizationStep.mockResolvedValue({
                completed: true,
                authData: {},
            });

            await useCase.execute('test-session-123', 'user-123', 1, {});

            expect(
                mockDefinition.getAuthRequirementsForStep
            ).not.toHaveBeenCalled();
        });
    });

    describe('Error Handling', () => {
        it('should propagate repository errors', async () => {
            mockRepository.findBySessionId.mockRejectedValue(
                new Error('Database connection error')
            );

            await expect(
                useCase.execute('test-session-123', 'user-123', 1, {})
            ).rejects.toThrow('Database connection error');
        });

        it('should propagate module processing errors', async () => {
            mockRepository.findBySessionId.mockResolvedValue(mockSession);

            const mockDefinition = mockModuleDefinitions[0].definition;
            mockDefinition.processAuthorizationStep.mockRejectedValue(
                new Error('Invalid OTP')
            );

            await expect(
                useCase.execute('test-session-123', 'user-123', 1, {})
            ).rejects.toThrow('Invalid OTP');
        });

        it('should handle repository update failures', async () => {
            mockRepository.findBySessionId.mockResolvedValue(mockSession);
            mockRepository.update.mockRejectedValue(new Error('Update failed'));

            const mockDefinition = mockModuleDefinitions[0].definition;
            mockDefinition.processAuthorizationStep.mockResolvedValue({
                nextStep: 2,
                stepData: {},
            });

            await expect(
                useCase.execute('test-session-123', 'user-123', 1, {})
            ).rejects.toThrow('Update failed');
        });

        it('should handle missing requirements gracefully', async () => {
            mockRepository.findBySessionId.mockResolvedValue(mockSession);
            mockRepository.update.mockResolvedValue(mockSession);

            const mockDefinition = mockModuleDefinitions[0].definition;
            mockDefinition.processAuthorizationStep.mockResolvedValue({
                nextStep: 2,
                stepData: {},
            });
            mockDefinition.getAuthRequirementsForStep.mockRejectedValue(
                new Error('Step not defined')
            );

            await expect(
                useCase.execute('test-session-123', 'user-123', 1, {})
            ).rejects.toThrow('Step not defined');
        });
    });

    describe('Multi-Step Workflows', () => {
        it('should handle 2-step Nagaris OTP flow', async () => {
            // Step 1: Email submission
            mockRepository.findBySessionId.mockResolvedValue(mockSession);
            mockRepository.update.mockResolvedValue(mockSession);

            const mockDefinition = mockModuleDefinitions[0].definition;
            mockDefinition.processAuthorizationStep.mockResolvedValue({
                nextStep: 2,
                stepData: { email: 'test@example.com' },
            });
            mockDefinition.getAuthRequirementsForStep.mockResolvedValue({
                type: 'otp',
            });

            const step1Result = await useCase.execute(
                'test-session-123',
                'user-123',
                1,
                { email: 'test@example.com' }
            );

            expect(step1Result.nextStep).toBe(2);
            expect(step1Result.completed).toBeUndefined();

            // Step 2: OTP verification
            mockSession.currentStep = 2;
            mockSession.stepData = { email: 'test@example.com' };
            mockDefinition.processAuthorizationStep.mockResolvedValue({
                completed: true,
                authData: { access_token: 'token123' },
            });

            const step2Result = await useCase.execute(
                'test-session-123',
                'user-123',
                3,
                { otp: '123456' }
            );

            expect(step2Result.completed).toBe(true);
            expect(step2Result.authData.access_token).toBe('token123');
        });

        it('should handle 3-step complex flow', async () => {
            mockSession.maxSteps = 3;
            mockRepository.findBySessionId.mockResolvedValue(mockSession);
            mockRepository.update.mockResolvedValue(mockSession);

            const mockDefinition = mockModuleDefinitions[0].definition;

            // Step 1
            mockDefinition.processAuthorizationStep.mockResolvedValue({
                nextStep: 2,
                stepData: { email: 'test@example.com' },
            });
            mockDefinition.getAuthRequirementsForStep.mockResolvedValue({});

            const step1 = await useCase.execute(
                'test-session-123',
                'user-123',
                1,
                {}
            );
            expect(step1.nextStep).toBe(2);
            expect(step1.totalSteps).toBe(3);

            // Step 2
            mockSession.currentStep = 2;
            mockDefinition.processAuthorizationStep.mockResolvedValue({
                nextStep: 3,
                stepData: { otp: '123456' },
            });

            const step2 = await useCase.execute(
                'test-session-123',
                'user-123',
                3,
                {}
            );
            expect(step2.nextStep).toBe(3);

            // Step 3
            mockSession.currentStep = 3;
            mockDefinition.processAuthorizationStep.mockResolvedValue({
                completed: true,
                authData: {},
            });

            const step3 = await useCase.execute(
                'test-session-123',
                'user-123',
                4,
                {}
            );
            expect(step3.completed).toBe(true);
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty stepData', async () => {
            mockRepository.findBySessionId.mockResolvedValue(mockSession);
            mockRepository.update.mockResolvedValue(mockSession);

            const mockDefinition = mockModuleDefinitions[0].definition;
            mockDefinition.processAuthorizationStep.mockResolvedValue({
                nextStep: 2,
                stepData: undefined,
            });
            mockDefinition.getAuthRequirementsForStep.mockResolvedValue({});

            const result = await useCase.execute(
                'test-session-123',
                'user-123',
                1,
                {}
            );

            expect(mockSession.advanceStep).toHaveBeenCalledWith({});
        });

        it('should handle module returning no message', async () => {
            mockRepository.findBySessionId.mockResolvedValue(mockSession);
            mockRepository.update.mockResolvedValue(mockSession);

            const mockDefinition = mockModuleDefinitions[0].definition;
            mockDefinition.processAuthorizationStep.mockResolvedValue({
                nextStep: 2,
                stepData: {},
            });
            mockDefinition.getAuthRequirementsForStep.mockResolvedValue({});

            const result = await useCase.execute(
                'test-session-123',
                'user-123',
                1,
                {}
            );

            expect(result.message).toBeUndefined();
        });

        it('should handle special characters in stepData', async () => {
            mockRepository.findBySessionId.mockResolvedValue(mockSession);
            mockRepository.update.mockResolvedValue(mockSession);

            const specialData = {
                email: 'test+special@example.com',
                domain: 'example.co.uk',
            };

            const mockDefinition = mockModuleDefinitions[0].definition;
            mockDefinition.processAuthorizationStep.mockResolvedValue({
                nextStep: 2,
                stepData: specialData,
            });
            mockDefinition.getAuthRequirementsForStep.mockResolvedValue({});

            await useCase.execute(
                'test-session-123',
                'user-123',
                1,
                specialData
            );

            expect(
                mockDefinition.processAuthorizationStep
            ).toHaveBeenCalledWith(
                expect.any(Object),
                1,
                specialData,
                expect.any(Object)
            );
        });
    });
});
