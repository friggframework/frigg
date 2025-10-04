/**
 * ProcessAuthorizationStepUseCase Unit Tests
 */

const { ProcessAuthorizationStepUseCase } = require('../../../use-cases/process-authorization-step');
const {
    TestAuthorizationSessionRepository,
    createTestSession,
    createExpiredSession,
    getTestModuleDefinitions,
} = require('../../helpers/auth-test-helpers');

describe('ProcessAuthorizationStepUseCase', () => {
    let useCase;
    let authSessionRepository;
    let moduleDefinitions;

    beforeEach(() => {
        authSessionRepository = new TestAuthorizationSessionRepository();
        moduleDefinitions = getTestModuleDefinitions();
        useCase = new ProcessAuthorizationStepUseCase({
            authSessionRepository,
            moduleDefinitions,
        });
    });

    afterEach(() => {
        authSessionRepository.clear();
    });

    describe('Constructor', () => {
        it('should require authSessionRepository', () => {
            expect(() => {
                new ProcessAuthorizationStepUseCase({
                    moduleDefinitions,
                });
            }).toThrow('authSessionRepository is required');
        });

        it('should require moduleDefinitions array', () => {
            expect(() => {
                new ProcessAuthorizationStepUseCase({
                    authSessionRepository,
                });
            }).toThrow('moduleDefinitions array is required');
        });
    });

    describe('execute - Multi-Step Flow (Nagaris)', () => {
        let session;

        beforeEach(async () => {
            session = createTestSession({
                userId: 'user-123',
                entityType: 'nagaris',
                maxSteps: 2,
                currentStep: 1,
            });
            await authSessionRepository.create(session);
        });

        it('should process step 1 and return next step requirements', async () => {
            const result = await useCase.execute(
                session.sessionId,
                'user-123',
                1,
                { email: 'test@example.com' }
            );

            expect(result.completed).toBeUndefined();
            expect(result.nextStep).toBe(2);
            expect(result.totalSteps).toBe(2);
            expect(result.requirements).toBeDefined();
            expect(result.requirements.type).toBe('otp');
            expect(result.message).toBe('OTP sent to your email');
        });

        it('should advance session step after processing', async () => {
            await useCase.execute(
                session.sessionId,
                'user-123',
                1,
                { email: 'test@example.com' }
            );

            const updated = await authSessionRepository.findBySessionId(session.sessionId);
            expect(updated.currentStep).toBe(2);
            expect(updated.stepData.email).toBe('test@example.com');
        });

        it('should complete flow on final step', async () => {
            // First complete step 1
            await useCase.execute(
                session.sessionId,
                'user-123',
                1,
                { email: 'test@example.com' }
            );

            // Then process step 2
            const result = await useCase.execute(
                session.sessionId,
                'user-123',
                2,
                { email: 'test@example.com', otp: '123456' }
            );

            expect(result.completed).toBe(true);
            expect(result.authData).toBeDefined();
            expect(result.authData.access_token).toBe('mock_access_token_123');
        });

        it('should mark session as completed on final step', async () => {
            await useCase.execute(session.sessionId, 'user-123', 1, { email: 'test@example.com' });
            await useCase.execute(session.sessionId, 'user-123', 2, { email: 'test@example.com', otp: '123456' });

            const updated = await authSessionRepository.findBySessionId(session.sessionId);
            expect(updated.completed).toBe(true);
        });
    });

    describe('execute - Single-Step Flow (HubSpot)', () => {
        let session;

        beforeEach(async () => {
            session = createTestSession({
                userId: 'user-123',
                entityType: 'hubspot',
                maxSteps: 1,
                currentStep: 1,
            });
            await authSessionRepository.create(session);
        });

        it('should complete flow immediately for single-step', async () => {
            const result = await useCase.execute(
                session.sessionId,
                'user-123',
                1,
                { code: 'oauth_code_123' }
            );

            expect(result.completed).toBe(true);
            expect(result.authData).toBeDefined();
            expect(result.authData.access_token).toBe('hubspot_access_token');
        });
    });

    describe('Validation', () => {
        it('should throw error when sessionId is missing', async () => {
            await expect(
                useCase.execute('', 'user-123', 1, {})
            ).rejects.toThrow('sessionId is required');
        });

        it('should throw error when session not found', async () => {
            await expect(
                useCase.execute('nonexistent', 'user-123', 1, {})
            ).rejects.toThrow('Authorization session not found or expired');
        });

        it('should throw error when session belongs to different user', async () => {
            const session = createTestSession({ userId: 'user-123' });
            await authSessionRepository.create(session);

            await expect(
                useCase.execute(session.sessionId, 'user-456', 1, {})
            ).rejects.toThrow('Session does not belong to this user');
        });

        it('should throw error when session is expired', async () => {
            const session = createExpiredSession({ userId: 'user-123' });
            await authSessionRepository.create(session);

            await expect(
                useCase.execute(session.sessionId, 'user-123', 1, {})
            ).rejects.toThrow('Authorization session has expired');
        });

        it('should throw error when step is out of sequence', async () => {
            const session = createTestSession({ userId: 'user-123', currentStep: 1 });
            await authSessionRepository.create(session);

            await expect(
                useCase.execute(session.sessionId, 'user-123', 3, {})
            ).rejects.toThrow('Expected step 1, received step 3');
        });

        it('should throw error when module not found', async () => {
            const session = createTestSession({ userId: 'user-123', entityType: 'unknown' });
            await authSessionRepository.create(session);

            await expect(
                useCase.execute(session.sessionId, 'user-123', 1, {})
            ).rejects.toThrow('Module definition not found: unknown');
        });

        it('should throw error when stepData is not an object', async () => {
            await expect(
                useCase.execute('session', 'user-123', 1, 'invalid')
            ).rejects.toThrow('stepData object is required');
        });
    });
});
