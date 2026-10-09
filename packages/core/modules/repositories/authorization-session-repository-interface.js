/**
 * Port for persisting AuthorizationSession records (Management API v2
 * multi-step authorization). Adapters return AuthorizationSession domain
 * objects and never expired sessions from lookups.
 */
class AuthorizationSessionRepositoryInterface {
    /**
     * @param {import('../domain/authorization-session').AuthorizationSession} session
     * @returns {Promise<import('../domain/authorization-session').AuthorizationSession>}
     */
    async create(session) {
        throw new Error('Method create must be implemented by subclass');
    }

    /**
     * @param {string} sessionId
     * @returns {Promise<import('../domain/authorization-session').AuthorizationSession|null>}
     *   null when missing or expired.
     */
    async findBySessionId(sessionId) {
        throw new Error('Method findBySessionId must be implemented by subclass');
    }

    /**
     * Saves currentStep, stepData and completed.
     * @param {import('../domain/authorization-session').AuthorizationSession} session
     */
    async update(session) {
        throw new Error('Method update must be implemented by subclass');
    }

    /** @param {string} sessionId */
    async deleteBySessionId(sessionId) {
        throw new Error('Method deleteBySessionId must be implemented by subclass');
    }

    /**
     * Removes sessions that expired before `now`.
     * @param {Date} [now]
     * @returns {Promise<number>} how many were removed
     */
    async deleteExpired(now) {
        throw new Error('Method deleteExpired must be implemented by subclass');
    }
}

module.exports = { AuthorizationSessionRepositoryInterface };
