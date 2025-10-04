/**
 * AuthorizationSession Domain Entity Unit Tests
 * Tests the core business logic and validation of the AuthorizationSession entity
 */

const { AuthorizationSession } = require('../../../domain/entities/AuthorizationSession');

describe('AuthorizationSession Domain Entity', () => {
    describe('Constructor and Validation', () => {
        it('should create a valid session with all required fields', () => {
            const session = new AuthorizationSession({
                sessionId: 'test-session-123',
                userId: 'user-123',
                entityType: 'nagaris',
                currentStep: 1,
                maxSteps: 2,
                stepData: {},
                expiresAt: new Date(Date.now() + 15 * 60 * 1000),
            });

            expect(session.sessionId).toBe('test-session-123');
            expect(session.userId).toBe('user-123');
            expect(session.entityType).toBe('nagaris');
            expect(session.currentStep).toBe(1);
            expect(session.maxSteps).toBe(2);
            expect(session.completed).toBe(false);
        });

        it('should use default values for optional fields', () => {
            const session = new AuthorizationSession({
                sessionId: 'test-session-123',
                userId: 'user-123',
                entityType: 'nagaris',
                maxSteps: 2,
                expiresAt: new Date(Date.now() + 15 * 60 * 1000),
            });

            expect(session.currentStep).toBe(1);
            expect(session.stepData).toEqual({});
            expect(session.completed).toBe(false);
            expect(session.createdAt).toBeInstanceOf(Date);
            expect(session.updatedAt).toBeInstanceOf(Date);
        });

        it('should throw error when sessionId is missing', () => {
            expect(() => {
                new AuthorizationSession({
                    userId: 'user-123',
                    entityType: 'nagaris',
                    maxSteps: 2,
                    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
                });
            }).toThrow('Session ID is required');
        });

        it('should throw error when userId is missing', () => {
            expect(() => {
                new AuthorizationSession({
                    sessionId: 'test-session-123',
                    entityType: 'nagaris',
                    maxSteps: 2,
                    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
                });
            }).toThrow('User ID is required');
        });

        it('should throw error when entityType is missing', () => {
            expect(() => {
                new AuthorizationSession({
                    sessionId: 'test-session-123',
                    userId: 'user-123',
                    maxSteps: 2,
                    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
                });
            }).toThrow('Entity type is required');
        });

        it('should throw error when step is less than 1', () => {
            expect(() => {
                new AuthorizationSession({
                    sessionId: 'test-session-123',
                    userId: 'user-123',
                    entityType: 'nagaris',
                    currentStep: 0,
                    maxSteps: 2,
                    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
                });
            }).toThrow('Step must be >= 1');
        });

        it('should throw error when currentStep exceeds maxSteps', () => {
            expect(() => {
                new AuthorizationSession({
                    sessionId: 'test-session-123',
                    userId: 'user-123',
                    entityType: 'nagaris',
                    currentStep: 3,
                    maxSteps: 2,
                    expiresAt: new Date(Date.now() + 15 * 60 * 1000),
                });
            }).toThrow('Current step cannot exceed max steps');
        });

        it('should throw error when session is already expired', () => {
            const expiredDate = new Date(Date.now() - 60 * 1000); // 1 minute ago

            expect(() => {
                new AuthorizationSession({
                    sessionId: 'test-session-123',
                    userId: 'user-123',
                    entityType: 'nagaris',
                    maxSteps: 2,
                    expiresAt: expiredDate,
                });
            }).toThrow('Session has expired');
        });
    });

    describe('advanceStep', () => {
        let session;

        beforeEach(() => {
            session = new AuthorizationSession({
                sessionId: 'test-session-123',
                userId: 'user-123',
                entityType: 'nagaris',
                currentStep: 1,
                maxSteps: 2,
                stepData: { email: 'test@example.com' },
                expiresAt: new Date(Date.now() + 15 * 60 * 1000),
            });
        });

        it('should advance to next step', () => {
            const beforeStep = session.currentStep;
            session.advanceStep({ otp: '123456' });

            expect(session.currentStep).toBe(beforeStep + 1);
        });

        it('should merge new step data with existing data', () => {
            session.advanceStep({ otp: '123456' });

            expect(session.stepData).toEqual({
                email: 'test@example.com',
                otp: '123456',
            });
        });

        it('should update the updatedAt timestamp', () => {
            const beforeUpdate = session.updatedAt;

            // Wait a tiny bit to ensure time difference
            setTimeout(() => {
                session.advanceStep({ otp: '123456' });
                expect(session.updatedAt).not.toEqual(beforeUpdate);
            }, 10);
        });

        it('should throw error when trying to advance completed session', () => {
            session.markComplete();

            expect(() => {
                session.advanceStep({ otp: '123456' });
            }).toThrow('Cannot advance completed session');
        });

        it('should handle empty new step data', () => {
            session.advanceStep({});

            expect(session.currentStep).toBe(2);
            expect(session.stepData).toEqual({ email: 'test@example.com' });
        });

        it('should overwrite existing keys with new values', () => {
            session.advanceStep({ email: 'newemail@example.com' });

            expect(session.stepData.email).toBe('newemail@example.com');
        });
    });

    describe('markComplete', () => {
        let session;

        beforeEach(() => {
            session = new AuthorizationSession({
                sessionId: 'test-session-123',
                userId: 'user-123',
                entityType: 'nagaris',
                currentStep: 2,
                maxSteps: 2,
                stepData: {},
                expiresAt: new Date(Date.now() + 15 * 60 * 1000),
            });
        });

        it('should mark session as completed', () => {
            expect(session.completed).toBe(false);

            session.markComplete();

            expect(session.completed).toBe(true);
        });

        it('should update the updatedAt timestamp', () => {
            const beforeUpdate = session.updatedAt;

            setTimeout(() => {
                session.markComplete();
                expect(session.updatedAt).not.toEqual(beforeUpdate);
            }, 10);
        });

        it('should be idempotent (can call multiple times)', () => {
            session.markComplete();
            session.markComplete();

            expect(session.completed).toBe(true);
        });
    });

    describe('isExpired', () => {
        it('should return false for non-expired session', () => {
            const session = new AuthorizationSession({
                sessionId: 'test-session-123',
                userId: 'user-123',
                entityType: 'nagaris',
                maxSteps: 2,
                expiresAt: new Date(Date.now() + 15 * 60 * 1000),
            });

            expect(session.isExpired()).toBe(false);
        });

        it('should return true for expired session', () => {
            const session = new AuthorizationSession({
                sessionId: 'test-session-123',
                userId: 'user-123',
                entityType: 'nagaris',
                maxSteps: 2,
                expiresAt: new Date(Date.now() + 15 * 60 * 1000),
            });

            // Manually set expiration to past
            session.expiresAt = new Date(Date.now() - 60 * 1000);

            expect(session.isExpired()).toBe(true);
        });

        it('should return true when exactly at expiration time', () => {
            const now = new Date();
            const session = new AuthorizationSession({
                sessionId: 'test-session-123',
                userId: 'user-123',
                entityType: 'nagaris',
                maxSteps: 2,
                expiresAt: new Date(now.getTime() + 1000), // 1 second from now
            });

            // Set expiration to exact current time
            session.expiresAt = now;

            expect(session.isExpired()).toBe(true);
        });
    });

    describe('canAdvance', () => {
        it('should return true when session can advance', () => {
            const session = new AuthorizationSession({
                sessionId: 'test-session-123',
                userId: 'user-123',
                entityType: 'nagaris',
                currentStep: 1,
                maxSteps: 2,
                expiresAt: new Date(Date.now() + 15 * 60 * 1000),
            });

            expect(session.canAdvance()).toBe(true);
        });

        it('should return false when session is completed', () => {
            const session = new AuthorizationSession({
                sessionId: 'test-session-123',
                userId: 'user-123',
                entityType: 'nagaris',
                currentStep: 1,
                maxSteps: 2,
                expiresAt: new Date(Date.now() + 15 * 60 * 1000),
                completed: true,
            });

            expect(session.canAdvance()).toBe(false);
        });

        it('should return false when at max steps', () => {
            const session = new AuthorizationSession({
                sessionId: 'test-session-123',
                userId: 'user-123',
                entityType: 'nagaris',
                currentStep: 2,
                maxSteps: 2,
                expiresAt: new Date(Date.now() + 15 * 60 * 1000),
            });

            expect(session.canAdvance()).toBe(false);
        });

        it('should return false when both completed and at max steps', () => {
            const session = new AuthorizationSession({
                sessionId: 'test-session-123',
                userId: 'user-123',
                entityType: 'nagaris',
                currentStep: 2,
                maxSteps: 2,
                expiresAt: new Date(Date.now() + 15 * 60 * 1000),
                completed: true,
            });

            expect(session.canAdvance()).toBe(false);
        });
    });

    describe('Edge Cases', () => {
        it('should handle single-step sessions', () => {
            const session = new AuthorizationSession({
                sessionId: 'test-session-123',
                userId: 'user-123',
                entityType: 'hubspot',
                currentStep: 1,
                maxSteps: 1,
                expiresAt: new Date(Date.now() + 15 * 60 * 1000),
            });

            expect(session.canAdvance()).toBe(false);
            expect(session.currentStep).toBe(session.maxSteps);
        });

        it('should handle large stepData objects', () => {
            const largeStepData = {
                field1: 'a'.repeat(1000),
                field2: { nested: { deep: { data: 'value' } } },
                array: Array(100).fill({ item: 'data' }),
            };

            const session = new AuthorizationSession({
                sessionId: 'test-session-123',
                userId: 'user-123',
                entityType: 'nagaris',
                currentStep: 1,
                maxSteps: 2,
                stepData: largeStepData,
                expiresAt: new Date(Date.now() + 15 * 60 * 1000),
            });

            expect(session.stepData).toEqual(largeStepData);
        });

        it('should handle many steps', () => {
            const session = new AuthorizationSession({
                sessionId: 'test-session-123',
                userId: 'user-123',
                entityType: 'complex-auth',
                currentStep: 5,
                maxSteps: 10,
                expiresAt: new Date(Date.now() + 15 * 60 * 1000),
            });

            expect(session.canAdvance()).toBe(true);

            // Advance through remaining steps
            for (let i = 5; i < 10; i++) {
                session.advanceStep({ step: i + 1 });
            }

            expect(session.currentStep).toBe(10);
            expect(session.canAdvance()).toBe(false);
        });
    });
});
