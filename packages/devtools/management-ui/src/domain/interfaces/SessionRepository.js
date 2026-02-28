/**
 * SessionRepository Interface (Port)
 * Defines the contract for session data access
 */
export class SessionRepository {
    /**
     * Get all sessions
     * @returns {Promise<Session[]>}
     */
    async getAll() {
        throw new Error('Method getAll must be implemented')
    }

    /**
     * Get session by ID
     * @param {string} sessionId
     * @returns {Promise<Session|null>}
     */
    async getById(sessionId) {
        throw new Error('Method getById must be implemented')
    }

    /**
     * Get sessions by user ID
     * @param {string} userId
     * @returns {Promise<Session[]>}
     */
    async getByUserId(userId) {
        throw new Error('Method getByUserId must be implemented')
    }

    /**
     * Create new session
     * @param {Object} sessionData
     * @returns {Promise<Session>}
     */
    async create(sessionData) {
        throw new Error('Method create must be implemented')
    }

    /**
     * Update session
     * @param {string} sessionId
     * @param {Object} sessionData
     * @returns {Promise<Session>}
     */
    async update(sessionId, sessionData) {
        throw new Error('Method update must be implemented')
    }

    /**
     * Delete session
     * @param {string} sessionId
     * @returns {Promise<boolean>}
     */
    async delete(sessionId) {
        throw new Error('Method delete must be implemented')
    }

    /**
     * Get active sessions
     * @returns {Promise<Session[]>}
     */
    async getActive() {
        throw new Error('Method getActive must be implemented')
    }

    /**
     * Get session by token
     * @param {string} token
     * @returns {Promise<Session|null>}
     */
    async getByToken(token) {
        throw new Error('Method getByToken must be implemented')
    }

    /**
     * Invalidate session
     * @param {string} sessionId
     * @returns {Promise<boolean>}
     */
    async invalidate(sessionId) {
        throw new Error('Method invalidate must be implemented')
    }

    /**
     * Clean up expired sessions
     * @returns {Promise<number>} Number of sessions cleaned up
     */
    async cleanupExpired() {
        throw new Error('Method cleanupExpired must be implemented')
    }

    /**
     * Extend session
     * @param {string} sessionId
     * @param {number} durationMinutes
     * @returns {Promise<Session>}
     */
    async extend(sessionId, durationMinutes) {
        throw new Error('Method extend must be implemented')
    }
}
