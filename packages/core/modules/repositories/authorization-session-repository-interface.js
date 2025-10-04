/**
 * Authorization Session Repository Interface
 * Abstract base class defining the contract for AuthorizationSession persistence adapters
 *
 * This follows the Port in Hexagonal Architecture:
 * - Domain layer depends on this abstraction
 * - Concrete adapters (MongoDB, PostgreSQL) implement this interface
 * - Use cases receive repositories via dependency injection
 *
 * @abstract
 */
class AuthorizationSessionRepositoryInterface {
    /**
     * Create a new authorization session
     *
     * @param {import('../domain/entities/AuthorizationSession').AuthorizationSession} session - Session entity to create
     * @returns {Promise<import('../domain/entities/AuthorizationSession').AuthorizationSession>} Created session
     * @abstract
     */
    async create(session) {
        throw new Error('Method create must be implemented by subclass');
    }

    /**
     * Find session by session ID
     *
     * @param {string} sessionId - Unique session identifier
     * @returns {Promise<import('../domain/entities/AuthorizationSession').AuthorizationSession|null>} Session entity or null if not found/expired
     * @abstract
     */
    async findBySessionId(sessionId) {
        throw new Error('Method findBySessionId must be implemented by subclass');
    }

    /**
     * Find active session for user and entity type
     * Returns the most recent active (non-completed, non-expired) session
     *
     * @param {string} userId - User ID
     * @param {string} entityType - Entity type (module name)
     * @returns {Promise<import('../domain/entities/AuthorizationSession').AuthorizationSession|null>} Session entity or null if not found
     * @abstract
     */
    async findActiveSession(userId, entityType) {
        throw new Error(
            'Method findActiveSession must be implemented by subclass'
        );
    }

    /**
     * Find session by OAuth state parameter
     * Used for OAuth2 callback processing
     *
     * @param {string} oauthState - OAuth state parameter
     * @returns {Promise<import('../domain/entities/AuthorizationSession').AuthorizationSession|null>} Session entity or null if not found/expired
     * @abstract
     */
    async findByOAuthState(oauthState) {
        throw new Error('Method findByOAuthState must be implemented by subclass');
    }

    /**
     * Update existing session
     *
     * @param {import('../domain/entities/AuthorizationSession').AuthorizationSession} session - Session entity with updated data
     * @returns {Promise<import('../domain/entities/AuthorizationSession').AuthorizationSession>} Updated session
     * @abstract
     */
    async update(session) {
        throw new Error('Method update must be implemented by subclass');
    }

    /**
     * Delete expired sessions (cleanup operation)
     * Should be called periodically to remove old sessions
     *
     * @returns {Promise<number>} Number of deleted sessions
     * @abstract
     */
    async deleteExpired() {
        throw new Error('Method deleteExpired must be implemented by subclass');
    }
}

module.exports = { AuthorizationSessionRepositoryInterface };
