/**
 * ProcessOAuth2CallbackUseCase Tests
 * TDD approach - write tests first, then fix implementation
 */

const { ProcessOAuth2CallbackUseCase } = require('../../use-cases/process-oauth2-callback');
const { AuthorizationSession } = require('../../domain/entities/AuthorizationSession');

describe('ProcessOAuth2CallbackUseCase', () => {
    let useCase;
    let mockAuthSessionRepo;
    let mockProcessAuthCallback;

    beforeEach(() => {
        // Mock authorization session repository
        mockAuthSessionRepo = {
            findByOAuthState: jest.fn(),
            update: jest.fn(),
        };

        // Mock process authorization callback use case
        mockProcessAuthCallback = {
            execute: jest.fn(),
        };

        // Create use case with injected dependencies
        useCase = new ProcessOAuth2CallbackUseCase({
            authSessionRepository: mockAuthSessionRepo,
            processAuthorizationCallback: mockProcessAuthCallback,
        });
    });

    describe('execute', () => {
        const validCode = 'auth_code_123';
        const validState = 'oauth_state_456';
        const userId = 'user_789';

        it('should successfully process OAuth callback with valid code and state', async () => {
            // Arrange
            const mockSession = new AuthorizationSession({
                sessionId: 'session_123',
                userId,
                entityType: 'hubspot',
                currentStep: 1,
                maxSteps: 1,
                stepData: {
                    oauthState: validState,
                    redirectContext: {
                        returnUrl: 'http://localhost:5173/integrations',
                        source: 'frigg-ui-library',
                    },
                },
                expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 min future
                completed: false,
            });

            const mockEntityDetails = {
                entity_id: 'entity_123',
                credential_id: 'cred_456',
                type: 'hubspot',
            };

            mockAuthSessionRepo.findByOAuthState.mockResolvedValue(mockSession);
            mockProcessAuthCallback.execute.mockResolvedValue(mockEntityDetails);
            mockAuthSessionRepo.update.mockResolvedValue(mockSession);

            // Act
            const result = await useCase.execute(validCode, validState);

            // Assert
            expect(mockAuthSessionRepo.findByOAuthState).toHaveBeenCalledWith(validState);
            expect(mockProcessAuthCallback.execute).toHaveBeenCalledWith(
                userId,
                'hubspot',
                { code: validCode }
            );
            expect(mockAuthSessionRepo.update).toHaveBeenCalled();
            expect(result).toEqual({
                entity: {
                    id: 'entity_123',
                    moduleType: 'hubspot',
                    credentialId: 'cred_456',
                },
                redirectUrl: 'http://localhost:5173/integrations',
            });
        });

        it('should throw error if session not found', async () => {
            // Arrange
            mockAuthSessionRepo.findByOAuthState.mockResolvedValue(null);

            // Act & Assert
            await expect(useCase.execute(validCode, validState))
                .rejects
                .toThrow('Invalid or expired OAuth session');

            expect(mockAuthSessionRepo.findByOAuthState).toHaveBeenCalledWith(validState);
            expect(mockProcessAuthCallback.execute).not.toHaveBeenCalled();
        });

        it('should throw error if session is expired', async () => {
            // Arrange - Create session that will expire, then manipulate it
            const mockSession = new AuthorizationSession({
                sessionId: 'session_123',
                userId,
                entityType: 'hubspot',
                currentStep: 1,
                maxSteps: 1,
                stepData: { oauthState: validState },
                expiresAt: new Date(Date.now() + 1000), // Valid initially
                completed: false,
            });

            // Manually set expiration to past (bypassing validation)
            mockSession.expiresAt = new Date(Date.now() - 1000);

            mockAuthSessionRepo.findByOAuthState.mockResolvedValue(mockSession);

            // Act & Assert
            await expect(useCase.execute(validCode, validState))
                .rejects
                .toThrow('OAuth session has expired');

            expect(mockProcessAuthCallback.execute).not.toHaveBeenCalled();
        });

        it('should use default redirect URL if not provided in session', async () => {
            // Arrange
            const sessionWithoutRedirect = new AuthorizationSession({
                sessionId: 'session_123',
                userId,
                entityType: 'hubspot',
                currentStep: 1,
                maxSteps: 1,
                stepData: {
                    oauthState: validState,
                    redirectContext: {
                        source: 'frigg-ui-library',
                        // No returnUrl
                    },
                },
                expiresAt: new Date(Date.now() + 15 * 60 * 1000),
                completed: false,
            });

            const mockEntityDetails = {
                entity_id: 'entity_123',
                credential_id: 'cred_456',
                type: 'hubspot',
            };

            mockAuthSessionRepo.findByOAuthState.mockResolvedValue(sessionWithoutRedirect);
            mockProcessAuthCallback.execute.mockResolvedValue(mockEntityDetails);
            mockAuthSessionRepo.update.mockResolvedValue(sessionWithoutRedirect);

            // Act
            const result = await useCase.execute(validCode, validState);

            // Assert
            expect(result.redirectUrl).toMatch(/\/test-area$/);
        });

        it('should mark session as completed after successful processing', async () => {
            // Arrange
            const mockSession = new AuthorizationSession({
                sessionId: 'session_123',
                userId,
                entityType: 'hubspot',
                currentStep: 1,
                maxSteps: 1,
                stepData: {
                    oauthState: validState,
                    redirectContext: { returnUrl: '/integrations' },
                },
                expiresAt: new Date(Date.now() + 15 * 60 * 1000),
                completed: false,
            });

            const mockEntityDetails = {
                entity_id: 'entity_123',
                credential_id: 'cred_456',
                type: 'hubspot',
            };

            mockAuthSessionRepo.findByOAuthState.mockResolvedValue(mockSession);
            mockProcessAuthCallback.execute.mockResolvedValue(mockEntityDetails);
            mockAuthSessionRepo.update.mockResolvedValue(mockSession);

            // Act
            await useCase.execute(validCode, validState);

            // Assert
            expect(mockSession.completed).toBe(true);
            expect(mockAuthSessionRepo.update).toHaveBeenCalledWith(mockSession);
        });

        it('should propagate errors from processAuthorizationCallback', async () => {
            // Arrange
            const mockSession = new AuthorizationSession({
                sessionId: 'session_123',
                userId,
                entityType: 'hubspot',
                currentStep: 1,
                maxSteps: 1,
                stepData: { oauthState: validState },
                expiresAt: new Date(Date.now() + 15 * 60 * 1000),
                completed: false,
            });

            mockAuthSessionRepo.findByOAuthState.mockResolvedValue(mockSession);
            mockProcessAuthCallback.execute.mockRejectedValue(
                new Error('Token exchange failed')
            );

            // Act & Assert
            await expect(useCase.execute(validCode, validState))
                .rejects
                .toThrow('Token exchange failed');
        });
    });
});
