/**
 * Process OAuth2 Callback Use Case
 * Handles OAuth2 callback and redirects user to appropriate destination
 */

class ProcessOAuth2CallbackUseCase {
    /**
     * @param {Object} params - Dependencies
     * @param {import('../repositories/authorization-session-repository-interface').AuthorizationSessionRepositoryInterface} params.authSessionRepository - Session repository
     * @param {import('./process-authorization-callback').ProcessAuthorizationCallback} params.processAuthorizationCallback - Authorization callback processor
     */
    constructor({ authSessionRepository, processAuthorizationCallback }) {
        this.authSessionRepository = authSessionRepository;
        this.processAuthorizationCallback = processAuthorizationCallback;
    }

    /**
     * Process OAuth2 callback and redirect user
     * 
     * @param {string} code - Authorization code from OAuth provider
     * @param {string} state - State parameter for session lookup
     * @returns {Promise<Object>} Redirect information
     */
    async execute(code, state) {
        console.log('[ProcessOAuth2Callback] Received parameters:', {
            code: code ? `${code.substring(0, 20)}...` : 'MISSING',
            state: state ? `${state.substring(0, 20)}...` : 'MISSING'
        });

        // Find session by state
        const session = await this.authSessionRepository.findByOAuthState(state);

        if (!session) {
            throw new Error('Invalid or expired OAuth session');
        }

        if (session.expiresAt < new Date()) {
            throw new Error('OAuth session has expired');
        }

        const params = { code, state };
        console.log('[ProcessOAuth2Callback] Calling processAuthorizationCallback with params:', {
            userId: session.userId,
            entityType: session.entityType,
            paramsKeys: Object.keys(params),
            paramsValues: {
                code: params.code ? `${params.code.substring(0, 20)}...` : 'MISSING',
                state: params.state ? `${params.state.substring(0, 20)}...` : 'MISSING'
            }
        });

        // Process the authorization callback with both code and state
        const entityDetails = await this.processAuthorizationCallback.execute(
            session.userId,
            session.entityType,
            params
        );

        // Mark session as completed
        session.markComplete();
        await this.authSessionRepository.update(session);

        // Extract redirect context
        const { redirectContext } = session.stepData;

        return {
            entity: {
                id: entityDetails.entity_id,
                moduleType: session.entityType,
                credentialId: entityDetails.credential_id,
            },
            redirectUrl: redirectContext?.returnUrl || '/test-area',
            frontendBaseUrl: redirectContext?.frontendBaseUrl || null
        };
    }
}

module.exports = { ProcessOAuth2CallbackUseCase };
