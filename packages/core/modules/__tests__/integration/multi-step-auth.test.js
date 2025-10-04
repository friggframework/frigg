/**
 * Multi-Step Authorization Flow Integration Tests
 * Tests complete multi-step authentication workflows end-to-end
 */

const {
    TestAuthorizationSessionRepository,
    getTestModuleDefinitions,
    createTestSession,
} = require('../helpers/auth-test-helpers');

const { StartAuthorizationSessionUseCase } = require('../../use-cases/start-authorization-session');
const { ProcessAuthorizationStepUseCase } = require('../../use-cases/process-authorization-step');
const { GetAuthorizationRequirementsUseCase } = require('../../use-cases/get-authorization-requirements');

describe('Multi-Step Authorization Flow - Integration', () => {
    let authSessionRepository;
    let moduleDefinitions;
    let startAuthSession;
    let processAuthStep;
    let getAuthRequirements;

    beforeEach(() => {
        authSessionRepository = new TestAuthorizationSessionRepository();
        moduleDefinitions = getTestModuleDefinitions();

        startAuthSession = new StartAuthorizationSessionUseCase({
            authSessionRepository,
        });

        processAuthStep = new ProcessAuthorizationStepUseCase({
            authSessionRepository,
            moduleDefinitions,
        });

        getAuthRequirements = new GetAuthorizationRequirementsUseCase({
            moduleDefinitions,
        });
    });

    afterEach(() => {
        authSessionRepository.clear();
    });

    describe('Nagaris 2-Step OTP Flow', () => {
        it('should complete full OTP authentication flow', async () => {
            const userId = 'user-123';
            const entityType = 'nagaris';

            // Step 1: Get initial requirements
            const step1Reqs = await getAuthRequirements.execute(entityType, 1);
            expect(step1Reqs.type).toBe('email');
            expect(step1Reqs.isMultiStep).toBe(true);
            expect(step1Reqs.totalSteps).toBe(2);

            // Step 2: Start session
            const session = await startAuthSession.execute(userId, entityType, 2);
            expect(session.sessionId).toBeDefined();
            expect(session.currentStep).toBe(1);

            // Step 3: Submit email (step 1)
            const step1Result = await processAuthStep.execute(
                session.sessionId,
                userId,
                1,
                { email: 'test@example.com' }
            );

            expect(step1Result.completed).toBeUndefined();
            expect(step1Result.nextStep).toBe(2);
            expect(step1Result.requirements.type).toBe('otp');
            expect(step1Result.message).toBe('OTP sent to your email');

            // Step 4: Submit OTP (step 2)
            const step2Result = await processAuthStep.execute(
                session.sessionId,
                userId,
                2,
                { email: 'test@example.com', otp: '123456' }
            );

            expect(step2Result.completed).toBe(true);
            expect(step2Result.authData).toBeDefined();
            expect(step2Result.authData.access_token).toBe('mock_access_token_123');
            expect(step2Result.authData.user.email).toBe('test@example.com');

            // Verify session marked as complete
            const finalSession = await authSessionRepository.findBySessionId(session.sessionId);
            expect(finalSession.completed).toBe(true);
            expect(finalSession.currentStep).toBe(2);
        });

        it('should preserve data between steps', async () => {
            const userId = 'user-123';
            const session = await startAuthSession.execute(userId, 'nagaris', 2);

            // Submit step 1
            await processAuthStep.execute(
                session.sessionId,
                userId,
                1,
                { email: 'preserved@example.com' }
            );

            // Verify step data persisted
            const updatedSession = await authSessionRepository.findBySessionId(session.sessionId);
            expect(updatedSession.stepData.email).toBe('preserved@example.com');

            // Submit step 2
            const result = await processAuthStep.execute(
                session.sessionId,
                userId,
                2,
                { email: 'preserved@example.com', otp: '999999' }
            );

            expect(result.authData.user.email).toBe('preserved@example.com');
        });

        it('should reject invalid OTP', async () => {
            const userId = 'user-123';
            const session = await startAuthSession.execute(userId, 'nagaris', 2);

            await processAuthStep.execute(session.sessionId, userId, 1, { email: 'test@example.com' });

            // Invalid OTP '000000' should throw
            await expect(
                processAuthStep.execute(
                    session.sessionId,
                    userId,
                    2,
                    { email: 'test@example.com', otp: '000000' }
                )
            ).rejects.toThrow('Invalid OTP');
        });
    });

    describe('HubSpot Single-Step OAuth Flow', () => {
        it('should complete single-step OAuth flow', async () => {
            const userId = 'user-123';
            const entityType = 'hubspot';

            // Get requirements
            const reqs = await getAuthRequirements.execute(entityType, 1);
            expect(reqs.type).toBe('oauth2');
            expect(reqs.isMultiStep).toBe(false);

            // Start session
            const session = await startAuthSession.execute(userId, entityType, 1);

            // Submit OAuth code
            const result = await processAuthStep.execute(
                session.sessionId,
                userId,
                1,
                { code: 'oauth_code_123' }
            );

            expect(result.completed).toBe(true);
            expect(result.authData.access_token).toBe('hubspot_access_token');
        });
    });

    describe('Slack 2-Step OAuth + Selection Flow', () => {
        it('should complete OAuth followed by workspace selection', async () => {
            const userId = 'user-123';
            const session = await startAuthSession.execute(userId, 'slack', 2);

            // Step 1: OAuth
            const step1Result = await processAuthStep.execute(
                session.sessionId,
                userId,
                1,
                { code: 'slack_oauth_code' }
            );

            expect(step1Result.nextStep).toBe(2);
            expect(step1Result.requirements.type).toBe('selection');

            // Step 2: Workspace selection
            const step2Result = await processAuthStep.execute(
                session.sessionId,
                userId,
                2,
                { workspaceId: 'T123' }
            );

            expect(step2Result.completed).toBe(true);
            expect(step2Result.authData.workspaceId).toBe('T123');
        });
    });

    describe('Session Management', () => {
        it('should allow restarting from step 1', async () => {
            const userId = 'user-123';
            const session = await startAuthSession.execute(userId, 'nagaris', 2);

            // Complete step 1
            await processAuthStep.execute(
                session.sessionId,
                userId,
                1,
                { email: 'first@example.com' }
            );

            // Restart from step 1 with different email
            const result = await processAuthStep.execute(
                session.sessionId,
                userId,
                1,
                { email: 'second@example.com' }
            );

            expect(result.nextStep).toBe(2);

            // Verify new email stored
            const updatedSession = await authSessionRepository.findBySessionId(session.sessionId);
            expect(updatedSession.stepData.email).toBe('second@example.com');
        });

        it('should expire sessions after timeout', async () => {
            const session = createTestSession({
                userId: 'user-123',
                entityType: 'nagaris',
                expirationMinutes: -1, // Already expired
            });
            await authSessionRepository.create(session);

            await expect(
                processAuthStep.execute(
                    session.sessionId,
                    'user-123',
                    1,
                    { email: 'test@example.com' }
                )
            ).rejects.toThrow('Authorization session has expired');
        });

        it('should enforce user ownership of sessions', async () => {
            const session = await startAuthSession.execute('user-123', 'nagaris', 2);

            // Different user tries to use session
            await expect(
                processAuthStep.execute(
                    session.sessionId,
                    'user-456',
                    1,
                    { email: 'test@example.com' }
                )
            ).rejects.toThrow('Session does not belong to this user');
        });

        it('should prevent skipping steps', async () => {
            const session = await startAuthSession.execute('user-123', 'nagaris', 2);

            // Try to skip to step 2 without completing step 1
            await expect(
                processAuthStep.execute(
                    session.sessionId,
                    'user-123',
                    2,
                    { email: 'test@example.com', otp: '123456' }
                )
            ).rejects.toThrow('Expected step 1, received step 2');
        });
    });

    describe('Multiple Concurrent Sessions', () => {
        it('should handle multiple sessions for same user', async () => {
            const userId = 'user-123';

            const nagarisSession = await startAuthSession.execute(userId, 'nagaris', 2);
            const hubspotSession = await startAuthSession.execute(userId, 'hubspot', 1);

            // Both sessions should be independent
            expect(nagarisSession.sessionId).not.toBe(hubspotSession.sessionId);

            // Can process both independently
            await processAuthStep.execute(nagarisSession.sessionId, userId, 1, { email: 'test@example.com' });
            await processAuthStep.execute(hubspotSession.sessionId, userId, 1, { code: 'oauth_code' });

            const nagaris = await authSessionRepository.findBySessionId(nagarisSession.sessionId);
            const hubspot = await authSessionRepository.findBySessionId(hubspotSession.sessionId);

            expect(nagaris.currentStep).toBe(2);
            expect(nagaris.completed).toBe(false);
            expect(hubspot.completed).toBe(true);
        });

        it('should handle multiple users simultaneously', async () => {
            const session1 = await startAuthSession.execute('user-1', 'nagaris', 2);
            const session2 = await startAuthSession.execute('user-2', 'nagaris', 2);

            await processAuthStep.execute(session1.sessionId, 'user-1', 1, { email: 'user1@example.com' });
            await processAuthStep.execute(session2.sessionId, 'user-2', 1, { email: 'user2@example.com' });

            const s1 = await authSessionRepository.findBySessionId(session1.sessionId);
            const s2 = await authSessionRepository.findBySessionId(session2.sessionId);

            expect(s1.stepData.email).toBe('user1@example.com');
            expect(s2.stepData.email).toBe('user2@example.com');
        });
    });

    describe('Error Recovery', () => {
        it('should maintain session state after error', async () => {
            const userId = 'user-123';
            const session = await startAuthSession.execute(userId, 'nagaris', 2);

            await processAuthStep.execute(session.sessionId, userId, 1, { email: 'test@example.com' });

            // Try invalid OTP
            await expect(
                processAuthStep.execute(session.sessionId, userId, 2, { email: 'test@example.com', otp: '000000' })
            ).rejects.toThrow();

            // Session should still exist and be at step 2
            const recovered = await authSessionRepository.findBySessionId(session.sessionId);
            expect(recovered).toBeDefined();
            expect(recovered.currentStep).toBe(2);
            expect(recovered.completed).toBe(false);

            // Can retry with valid OTP
            const result = await processAuthStep.execute(
                session.sessionId,
                userId,
                2,
                { email: 'test@example.com', otp: '123456' }
            );

            expect(result.completed).toBe(true);
        });
    });
});
