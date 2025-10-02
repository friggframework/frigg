const crypto = require('crypto');
const { AuthorizationSession } = require('../domain/entities/AuthorizationSession');

/**
 * Start Authorization Session Use Case
 * Business logic for initiating multi-step authorization workflows
 *
 * Responsibilities:
 * - Generate unique session identifiers
 * - Set appropriate session expiration (15 minutes)
 * - Create and persist new authorization session
 * - Validate input parameters
 *
 * @example
 * ```javascript
 * const useCase = new StartAuthorizationSessionUseCase({
 *     authSessionRepository: createAuthorizationSessionRepository()
 * });
 *
 * const session = await useCase.execute('user123', 'nagaris', 2);
 * // Returns new AuthorizationSession ready for step 1
 * ```
 */
class StartAuthorizationSessionUseCase {
    /**
     * @param {Object} params - Dependencies
     * @param {import('../repositories/authorization-session-repository-interface').AuthorizationSessionRepositoryInterface} params.authSessionRepository - Session repository
     */
    constructor({ authSessionRepository }) {
        if (!authSessionRepository) {
            throw new Error('authSessionRepository is required');
        }
        this.authSessionRepository = authSessionRepository;
    }

    /**
     * Start a new multi-step authorization session
     *
     * @param {string} userId - User ID initiating the auth flow
     * @param {string} entityType - Type of entity being authorized (module name)
     * @param {number} maxSteps - Total number of steps in the auth flow
     * @returns {Promise<import('../domain/entities/AuthorizationSession').AuthorizationSession>} Created session
     * @throws {Error} If validation fails
     */
    async execute(userId, entityType, maxSteps) {
        // Validate inputs
        if (!userId) {
            throw new Error('userId is required');
        }
        if (!entityType) {
            throw new Error('entityType is required');
        }
        if (!maxSteps || maxSteps < 1) {
            throw new Error('maxSteps must be >= 1');
        }

        // Generate cryptographically secure session ID
        const sessionId = crypto.randomUUID();

        // Set 15 minute expiration (configurable via env in future)
        const expirationMinutes = parseInt(
            process.env.AUTH_SESSION_EXPIRY_MINUTES || '15',
            10
        );
        const expiresAt = new Date(Date.now() + expirationMinutes * 60 * 1000);

        // Create domain entity
        const session = new AuthorizationSession({
            sessionId,
            userId,
            entityType,
            currentStep: 1,
            maxSteps,
            stepData: {},
            expiresAt,
            completed: false,
        });

        // Persist to database
        return await this.authSessionRepository.create(session);
    }
}

module.exports = { StartAuthorizationSessionUseCase };
