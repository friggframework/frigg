/**
 * Create OAuth2 Session Use Case
 * Creates a secure OAuth2 session for tracking authorization state
 */

const crypto = require('crypto');

class CreateOAuth2SessionUseCase {
    /**
     * @param {Object} params - Dependencies
     * @param {import('../repositories/authorization-session-repository-interface').AuthorizationSessionRepositoryInterface} params.authSessionRepository - Session repository
     */
    constructor({ authSessionRepository }) {
        this.authSessionRepository = authSessionRepository;
    }

    /**
     * Create OAuth2 session with redirect context
     * 
     * @param {string} userId - User ID
     * @param {string} moduleType - Module type being authorized
     * @param {Object} redirectContext - Context for post-auth redirect
     * @param {string} redirectContext.source - Source UI ('management-ui' | 'frigg-ui-library')
     * @param {string} redirectContext.returnUrl - URL to return to after auth
     * @param {Object} [redirectContext.metadata] - Additional context data
     * @returns {Promise<Object>} OAuth2 session with state and redirect URI
     */
    async execute(userId, moduleType, redirectContext) {
        // Generate secure session ID and state
        const sessionId = crypto.randomUUID();
        const state = crypto.randomBytes(16).toString('hex');

        // Create session with 15-minute expiration
        const session = {
            sessionId,
            userId,
            entityType: moduleType,
            currentStep: 1,
            maxSteps: 1, // OAuth2 is single-step
            stepData: {
                oauthState: state,
                redirectContext,
                moduleType
            },
            expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
            completed: false
        };

        await this.authSessionRepository.create(session);

        // Always use Frigg app as OAuth hub - it will redirect to appropriate UI
        const baseUrl = process.env.BASE_URL || 'http://localhost:3001';
        const redirectUri = `${baseUrl}/api/oauth/callback`;

        return {
            sessionId,
            state,
            redirectUri,
            expiresAt: session.expiresAt
        };
    }
}

module.exports = { CreateOAuth2SessionUseCase };
