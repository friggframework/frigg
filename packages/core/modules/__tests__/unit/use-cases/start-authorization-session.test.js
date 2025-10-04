/**
 * StartAuthorizationSessionUseCase Unit Tests
 * Tests the business logic for initiating multi-step authorization sessions
 */

const { StartAuthorizationSessionUseCase } = require('../../../use-cases/start-authorization-session');
const { TestAuthorizationSessionRepository } = require('../../helpers/auth-test-helpers');

describe('StartAuthorizationSessionUseCase', () => {
    let useCase;
    let authSessionRepository;

    beforeEach(() => {
        authSessionRepository = new TestAuthorizationSessionRepository();
        useCase = new StartAuthorizationSessionUseCase({
            authSessionRepository,
        });
    });

    afterEach(() => {
        authSessionRepository.clear();
    });

    describe('Constructor', () => {
        it('should require authSessionRepository dependency', () => {
            expect(() => {
                new StartAuthorizationSessionUseCase({});
            }).toThrow('authSessionRepository is required');
        });

        it('should initialize with valid repository', () => {
            const instance = new StartAuthorizationSessionUseCase({
                authSessionRepository,
            });

            expect(instance.authSessionRepository).toBe(authSessionRepository);
        });
    });

    describe('execute', () => {
        it('should create a new authorization session with valid inputs', async () => {
            const session = await useCase.execute('user-123', 'nagaris', 2);

            expect(session).toBeDefined();
            expect(session.sessionId).toBeDefined();
            expect(session.userId).toBe('user-123');
            expect(session.entityType).toBe('nagaris');
            expect(session.currentStep).toBe(1);
            expect(session.maxSteps).toBe(2);
            expect(session.completed).toBe(false);
        });

        it('should generate unique session IDs', async () => {
            const session1 = await useCase.execute('user-123', 'nagaris', 2);
            const session2 = await useCase.execute('user-123', 'nagaris', 2);

            expect(session1.sessionId).not.toBe(session2.sessionId);
        });

        it('should set expiration to 15 minutes by default', async () => {
            const before = new Date(Date.now() + 14 * 60 * 1000);
            const session = await useCase.execute('user-123', 'nagaris', 2);
            const after = new Date(Date.now() + 16 * 60 * 1000);

            expect(session.expiresAt.getTime()).toBeGreaterThan(before.getTime());
            expect(session.expiresAt.getTime()).toBeLessThan(after.getTime());
        });

        it('should initialize stepData as empty object', async () => {
            const session = await useCase.execute('user-123', 'nagaris', 2);

            expect(session.stepData).toEqual({});
        });

        it('should persist session to repository', async () => {
            const session = await useCase.execute('user-123', 'nagaris', 2);

            const retrieved = await authSessionRepository.findBySessionId(
                session.sessionId
            );

            expect(retrieved).toBeDefined();
            expect(retrieved.sessionId).toBe(session.sessionId);
        });

        it('should support single-step sessions', async () => {
            const session = await useCase.execute('user-123', 'hubspot', 1);

            expect(session.maxSteps).toBe(1);
            expect(session.currentStep).toBe(1);
        });

        it('should support multi-step sessions (>2 steps)', async () => {
            const session = await useCase.execute('user-123', 'complex-auth', 5);

            expect(session.maxSteps).toBe(5);
            expect(session.currentStep).toBe(1);
        });
    });

    describe('Input Validation', () => {
        it('should throw error when userId is missing', async () => {
            await expect(
                useCase.execute('', 'nagaris', 2)
            ).rejects.toThrow('userId is required');
        });

        it('should throw error when entityType is missing', async () => {
            await expect(
                useCase.execute('user-123', '', 2)
            ).rejects.toThrow('entityType is required');
        });

        it('should throw error when maxSteps is 0', async () => {
            await expect(
                useCase.execute('user-123', 'nagaris', 0)
            ).rejects.toThrow('maxSteps must be >= 1');
        });

        it('should throw error when maxSteps is negative', async () => {
            await expect(
                useCase.execute('user-123', 'nagaris', -1)
            ).rejects.toThrow('maxSteps must be >= 1');
        });
    });
});
