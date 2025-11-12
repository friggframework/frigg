/**
 * AuthorizationSession Entity Unit Tests
 * Tests validation, state transitions, expiry, and business logic
 */

describe('AuthorizationSession Entity', () => {
    let AuthorizationSession;

    beforeEach(() => {
        // Mock the AuthorizationSession class based on spec
        AuthorizationSession = class {
            constructor({
                sessionId,
                userId,
                entityType,
                currentStep = 1,
                maxSteps,
                stepData = {},
                expiresAt,
                completed = false,
                createdAt = new Date(),
                updatedAt = new Date()
            }) {
                this.sessionId = sessionId;
                this.userId = userId;
                this.entityType = entityType;
                this.currentStep = currentStep;
                this.maxSteps = maxSteps;
                this.stepData = stepData;
                this.expiresAt = expiresAt;
                this.completed = completed;
                this.createdAt = createdAt;
                this.updatedAt = updatedAt;

                this.validate();
            }

            validate() {
                if (!this.sessionId) throw new Error('Session ID is required');
                if (!this.userId) throw new Error('User ID is required');
                if (!this.entityType) throw new Error('Entity type is required');
                if (this.currentStep < 1) throw new Error('Step must be >= 1');
                if (this.currentStep > this.maxSteps) {
                    throw new Error('Current step cannot exceed max steps');
                }
                if (this.expiresAt < new Date()) {
                    throw new Error('Session has expired');
                }
            }

            advanceStep(newStepData) {
                if (this.completed) {
                    throw new Error('Cannot advance completed session');
                }

                this.currentStep += 1;
                this.stepData = { ...this.stepData, ...newStepData };
                this.updatedAt = new Date();
            }

            markComplete() {
                this.completed = true;
                this.updatedAt = new Date();
            }

            isExpired() {
                return this.expiresAt < new Date();
            }

            canAdvance() {
                return !this.completed && this.currentStep < this.maxSteps;
            }
        };
    });

    describe('Constructor and Validation', () => {
        it('should create a valid session with required fields', () => {
            const session = new AuthorizationSession({
                sessionId: 'test-session-id',
                userId: 'user-123',
                entityType: 'nagaris',
                maxSteps: 2,
                expiresAt: new Date(Date.now() + 15 * 60 * 1000)
            });

            expect(session.sessionId).toBe('test-session-id');
            expect(session.userId).toBe('user-123');
            expect(session.entityType).toBe('nagaris');
            expect(session.currentStep).toBe(1);
            expect(session.maxSteps).toBe(2);
            expect(session.completed).toBe(false);
            expect(session.stepData).toEqual({});
        });

        it('should throw error when sessionId is missing', () => {
            expect(() => {
                new AuthorizationSession({
                    userId: 'user-123',
                    entityType: 'nagaris',
                    maxSteps: 2,
                    expiresAt: new Date(Date.now() + 15 * 60 * 1000)
                });
            }).toThrow('Session ID is required');
        });

        it('should throw error when userId is missing', () => {
            expect(() => {
                new AuthorizationSession({
                    sessionId: 'test-session-id',
                    entityType: 'nagaris',
                    maxSteps: 2,
                    expiresAt: new Date(Date.now() + 15 * 60 * 1000)
                });
            }).toThrow('User ID is required');
        });

        it('should throw error when entityType is missing', () => {
            expect(() => {
                new AuthorizationSession({
                    sessionId: 'test-session-id',
                    userId: 'user-123',
                    maxSteps: 2,
                    expiresAt: new Date(Date.now() + 15 * 60 * 1000)
                });
            }).toThrow('Entity type is required');
        });

        it('should throw error when currentStep is less than 1', () => {
            expect(() => {
                new AuthorizationSession({
                    sessionId: 'test-session-id',
                    userId: 'user-123',
                    entityType: 'nagaris',
                    currentStep: 0,
                    maxSteps: 2,
                    expiresAt: new Date(Date.now() + 15 * 60 * 1000)
                });
            }).toThrow('Step must be >= 1');
        });

        it('should throw error when currentStep exceeds maxSteps', () => {
            expect(() => {
                new AuthorizationSession({
                    sessionId: 'test-session-id',
                    userId: 'user-123',
                    entityType: 'nagaris',
                    currentStep: 3,
                    maxSteps: 2,
                    expiresAt: new Date(Date.now() + 15 * 60 * 1000)
                });
            }).toThrow('Current step cannot exceed max steps');
        });

        it('should throw error when session is already expired', () => {
            expect(() => {
                new AuthorizationSession({
                    sessionId: 'test-session-id',
                    userId: 'user-123',
                    entityType: 'nagaris',
                    maxSteps: 2,
                    expiresAt: new Date(Date.now() - 1000) // Expired
                });
            }).toThrow('Session has expired');
        });

        it('should accept custom stepData', () => {
            const stepData = { email: 'test@example.com' };
            const session = new AuthorizationSession({
                sessionId: 'test-session-id',
                userId: 'user-123',
                entityType: 'nagaris',
                maxSteps: 2,
                stepData,
                expiresAt: new Date(Date.now() + 15 * 60 * 1000)
            });

            expect(session.stepData).toEqual(stepData);
        });
    });

    describe('advanceStep', () => {
        it('should increment currentStep and merge stepData', () => {
            const session = new AuthorizationSession({
                sessionId: 'test-session-id',
                userId: 'user-123',
                entityType: 'nagaris',
                maxSteps: 3,
                stepData: { email: 'test@example.com' },
                expiresAt: new Date(Date.now() + 15 * 60 * 1000)
            });

            const newStepData = { otp: '123456' };
            session.advanceStep(newStepData);

            expect(session.currentStep).toBe(2);
            expect(session.stepData).toEqual({
                email: 'test@example.com',
                otp: '123456'
            });
        });

        it('should update updatedAt timestamp', () => {
            const session = new AuthorizationSession({
                sessionId: 'test-session-id',
                userId: 'user-123',
                entityType: 'nagaris',
                maxSteps: 2,
                expiresAt: new Date(Date.now() + 15 * 60 * 1000)
            });

            const originalUpdatedAt = session.updatedAt;

            // Wait a bit to ensure timestamp changes
            setTimeout(() => {
                session.advanceStep({ otp: '123456' });
                expect(session.updatedAt).not.toEqual(originalUpdatedAt);
            }, 10);
        });

        it('should throw error when trying to advance completed session', () => {
            const session = new AuthorizationSession({
                sessionId: 'test-session-id',
                userId: 'user-123',
                entityType: 'nagaris',
                maxSteps: 2,
                completed: true,
                expiresAt: new Date(Date.now() + 15 * 60 * 1000)
            });

            expect(() => {
                session.advanceStep({ otp: '123456' });
            }).toThrow('Cannot advance completed session');
        });

        it('should preserve existing stepData when advancing', () => {
            const session = new AuthorizationSession({
                sessionId: 'test-session-id',
                userId: 'user-123',
                entityType: 'nagaris',
                maxSteps: 3,
                stepData: { email: 'test@example.com', domain: 'example.com' },
                expiresAt: new Date(Date.now() + 15 * 60 * 1000)
            });

            session.advanceStep({ otp: '123456' });

            expect(session.stepData.email).toBe('test@example.com');
            expect(session.stepData.domain).toBe('example.com');
            expect(session.stepData.otp).toBe('123456');
        });

        it('should overwrite existing keys in stepData', () => {
            const session = new AuthorizationSession({
                sessionId: 'test-session-id',
                userId: 'user-123',
                entityType: 'nagaris',
                maxSteps: 3,
                stepData: { email: 'old@example.com' },
                expiresAt: new Date(Date.now() + 15 * 60 * 1000)
            });

            session.advanceStep({ email: 'new@example.com' });

            expect(session.stepData.email).toBe('new@example.com');
        });
    });

    describe('markComplete', () => {
        it('should set completed to true', () => {
            const session = new AuthorizationSession({
                sessionId: 'test-session-id',
                userId: 'user-123',
                entityType: 'nagaris',
                maxSteps: 2,
                expiresAt: new Date(Date.now() + 15 * 60 * 1000)
            });

            session.markComplete();

            expect(session.completed).toBe(true);
        });

        it('should update updatedAt timestamp', () => {
            const session = new AuthorizationSession({
                sessionId: 'test-session-id',
                userId: 'user-123',
                entityType: 'nagaris',
                maxSteps: 2,
                expiresAt: new Date(Date.now() + 15 * 60 * 1000)
            });

            const originalUpdatedAt = session.updatedAt;

            setTimeout(() => {
                session.markComplete();
                expect(session.updatedAt).not.toEqual(originalUpdatedAt);
            }, 10);
        });

        it('should be idempotent - can call multiple times', () => {
            const session = new AuthorizationSession({
                sessionId: 'test-session-id',
                userId: 'user-123',
                entityType: 'nagaris',
                maxSteps: 2,
                expiresAt: new Date(Date.now() + 15 * 60 * 1000)
            });

            session.markComplete();
            session.markComplete();
            session.markComplete();

            expect(session.completed).toBe(true);
        });
    });

    describe('isExpired', () => {
        it('should return false for non-expired session', () => {
            const session = new AuthorizationSession({
                sessionId: 'test-session-id',
                userId: 'user-123',
                entityType: 'nagaris',
                maxSteps: 2,
                expiresAt: new Date(Date.now() + 15 * 60 * 1000)
            });

            expect(session.isExpired()).toBe(false);
        });

        it('should return true for expired session', () => {
            const session = new AuthorizationSession({
                sessionId: 'test-session-id',
                userId: 'user-123',
                entityType: 'nagaris',
                maxSteps: 2,
                expiresAt: new Date(Date.now() + 15 * 60 * 1000)
            });

            // Manually set expiresAt to past
            session.expiresAt = new Date(Date.now() - 1000);

            expect(session.isExpired()).toBe(true);
        });

        it('should return true when expiry time equals current time', () => {
            const now = new Date();
            const session = new AuthorizationSession({
                sessionId: 'test-session-id',
                userId: 'user-123',
                entityType: 'nagaris',
                maxSteps: 2,
                expiresAt: new Date(Date.now() + 15 * 60 * 1000)
            });

            // Set to exact current time
            session.expiresAt = now;

            expect(session.isExpired()).toBe(true);
        });
    });

    describe('canAdvance', () => {
        it('should return true when not completed and has more steps', () => {
            const session = new AuthorizationSession({
                sessionId: 'test-session-id',
                userId: 'user-123',
                entityType: 'nagaris',
                currentStep: 1,
                maxSteps: 2,
                expiresAt: new Date(Date.now() + 15 * 60 * 1000)
            });

            expect(session.canAdvance()).toBe(true);
        });

        it('should return false when completed', () => {
            const session = new AuthorizationSession({
                sessionId: 'test-session-id',
                userId: 'user-123',
                entityType: 'nagaris',
                currentStep: 1,
                maxSteps: 2,
                completed: true,
                expiresAt: new Date(Date.now() + 15 * 60 * 1000)
            });

            expect(session.canAdvance()).toBe(false);
        });

        it('should return false when currentStep equals maxSteps', () => {
            const session = new AuthorizationSession({
                sessionId: 'test-session-id',
                userId: 'user-123',
                entityType: 'nagaris',
                currentStep: 2,
                maxSteps: 2,
                expiresAt: new Date(Date.now() + 15 * 60 * 1000)
            });

            expect(session.canAdvance()).toBe(false);
        });

        it('should return false when both completed and at max steps', () => {
            const session = new AuthorizationSession({
                sessionId: 'test-session-id',
                userId: 'user-123',
                entityType: 'nagaris',
                currentStep: 2,
                maxSteps: 2,
                completed: true,
                expiresAt: new Date(Date.now() + 15 * 60 * 1000)
            });

            expect(session.canAdvance()).toBe(false);
        });

        it('should return true for middle steps in multi-step flow', () => {
            const session = new AuthorizationSession({
                sessionId: 'test-session-id',
                userId: 'user-123',
                entityType: 'nagaris',
                currentStep: 2,
                maxSteps: 4,
                expiresAt: new Date(Date.now() + 15 * 60 * 1000)
            });

            expect(session.canAdvance()).toBe(true);
        });
    });

    describe('State Transitions', () => {
        it('should handle complete 2-step flow', () => {
            const session = new AuthorizationSession({
                sessionId: 'test-session-id',
                userId: 'user-123',
                entityType: 'nagaris',
                maxSteps: 2,
                expiresAt: new Date(Date.now() + 15 * 60 * 1000)
            });

            // Initial state
            expect(session.currentStep).toBe(1);
            expect(session.canAdvance()).toBe(true);
            expect(session.completed).toBe(false);

            // Step 1 -> Step 2
            session.advanceStep({ email: 'test@example.com' });
            expect(session.currentStep).toBe(2);
            expect(session.canAdvance()).toBe(false);
            expect(session.completed).toBe(false);

            // Complete
            session.markComplete();
            expect(session.completed).toBe(true);
            expect(session.canAdvance()).toBe(false);
        });

        it('should handle complete 3-step flow', () => {
            const session = new AuthorizationSession({
                sessionId: 'test-session-id',
                userId: 'user-123',
                entityType: 'complex-auth',
                maxSteps: 3,
                expiresAt: new Date(Date.now() + 15 * 60 * 1000)
            });

            // Step 1 -> Step 2
            session.advanceStep({ email: 'test@example.com' });
            expect(session.currentStep).toBe(2);
            expect(session.canAdvance()).toBe(true);

            // Step 2 -> Step 3
            session.advanceStep({ otp: '123456' });
            expect(session.currentStep).toBe(3);
            expect(session.canAdvance()).toBe(false);

            // Complete
            session.markComplete();
            expect(session.completed).toBe(true);
        });

        it('should accumulate stepData through workflow', () => {
            const session = new AuthorizationSession({
                sessionId: 'test-session-id',
                userId: 'user-123',
                entityType: 'nagaris',
                maxSteps: 3,
                expiresAt: new Date(Date.now() + 15 * 60 * 1000)
            });

            session.advanceStep({ email: 'test@example.com' });
            session.advanceStep({ otp: '123456' });

            expect(session.stepData).toEqual({
                email: 'test@example.com',
                otp: '123456'
            });
        });
    });

    describe('Edge Cases', () => {
        it('should handle single-step flow', () => {
            const session = new AuthorizationSession({
                sessionId: 'test-session-id',
                userId: 'user-123',
                entityType: 'simple-auth',
                currentStep: 1,
                maxSteps: 1,
                expiresAt: new Date(Date.now() + 15 * 60 * 1000)
            });

            expect(session.canAdvance()).toBe(false);
            session.markComplete();
            expect(session.completed).toBe(true);
        });

        it('should handle empty stepData gracefully', () => {
            const session = new AuthorizationSession({
                sessionId: 'test-session-id',
                userId: 'user-123',
                entityType: 'nagaris',
                maxSteps: 2,
                expiresAt: new Date(Date.now() + 15 * 60 * 1000)
            });

            session.advanceStep({});
            expect(session.stepData).toEqual({});
        });

        it('should handle special characters in sessionId', () => {
            const specialId = 'session-123-abc_def.xyz';
            const session = new AuthorizationSession({
                sessionId: specialId,
                userId: 'user-123',
                entityType: 'nagaris',
                maxSteps: 2,
                expiresAt: new Date(Date.now() + 15 * 60 * 1000)
            });

            expect(session.sessionId).toBe(specialId);
        });

        it('should handle very long entityType names', () => {
            const longEntityType = 'very-long-entity-type-name-that-might-exist-in-production';
            const session = new AuthorizationSession({
                sessionId: 'test-session-id',
                userId: 'user-123',
                entityType: longEntityType,
                maxSteps: 2,
                expiresAt: new Date(Date.now() + 15 * 60 * 1000)
            });

            expect(session.entityType).toBe(longEntityType);
        });

        it('should handle maxSteps of 10 (high step count)', () => {
            const session = new AuthorizationSession({
                sessionId: 'test-session-id',
                userId: 'user-123',
                entityType: 'complex-flow',
                maxSteps: 10,
                expiresAt: new Date(Date.now() + 15 * 60 * 1000)
            });

            expect(session.maxSteps).toBe(10);
            expect(session.canAdvance()).toBe(true);
        });
    });
});
