/**
 * SessionRepositoryAdapter
 * Concrete implementation of SessionRepository interface
 */
import { SessionRepository } from '../../domain/interfaces/SessionRepository.js'

export class SessionRepositoryAdapter extends SessionRepository {
    constructor(apiClient) {
        super()
        this._apiClient = apiClient
    }

    /**
     * Get API client for direct access
     * @returns {Object}
     */
    get apiClient() {
        return this._apiClient
    }

    /**
     * Get all sessions
     * @returns {Promise<Session[]>}
     */
    async getAll() {
        try {
            const response = await this._apiClient.get('/sessions')
            return response.data
        } catch (error) {
            console.error('Error fetching sessions:', error)
            throw new Error('Failed to fetch sessions')
        }
    }

    /**
     * Get session by ID
     * @param {string} sessionId
     * @returns {Promise<Session|null>}
     */
    async getById(sessionId) {
        try {
            const response = await this._apiClient.get(`/sessions/${sessionId}`)
            return response.data
        } catch (error) {
            if (error.response?.status === 404) {
                return null
            }
            console.error('Error fetching session:', error)
            throw new Error('Failed to fetch session')
        }
    }

    /**
     * Get sessions by user ID
     * @param {string} userId
     * @returns {Promise<Session[]>}
     */
    async getByUserId(userId) {
        try {
            const response = await this._apiClient.get(`/sessions/user/${userId}`)
            return response.data
        } catch (error) {
            console.error('Error fetching sessions by user:', error)
            throw new Error('Failed to fetch sessions by user')
        }
    }

    /**
     * Create new session
     * @param {Object} sessionData
     * @returns {Promise<Session>}
     */
    async create(sessionData) {
        try {
            const response = await this._apiClient.post('/sessions', sessionData)
            return response.data
        } catch (error) {
            console.error('Error creating session:', error)
            throw new Error('Failed to create session')
        }
    }

    /**
     * Update session
     * @param {string} sessionId
     * @param {Object} sessionData
     * @returns {Promise<Session>}
     */
    async update(sessionId, sessionData) {
        try {
            const response = await this._apiClient.put(`/sessions/${sessionId}`, sessionData)
            return response.data
        } catch (error) {
            console.error('Error updating session:', error)
            throw new Error('Failed to update session')
        }
    }

    /**
     * Delete session
     * @param {string} sessionId
     * @returns {Promise<boolean>}
     */
    async delete(sessionId) {
        try {
            await this._apiClient.delete(`/sessions/${sessionId}`)
            return true
        } catch (error) {
            console.error('Error deleting session:', error)
            throw new Error('Failed to delete session')
        }
    }

    /**
     * Get active sessions
     * @returns {Promise<Session[]>}
     */
    async getActive() {
        try {
            const response = await this._apiClient.get('/sessions/active')
            return response.data
        } catch (error) {
            console.error('Error fetching active sessions:', error)
            throw new Error('Failed to fetch active sessions')
        }
    }

    /**
     * Get session by token
     * @param {string} token
     * @returns {Promise<Session|null>}
     */
    async getByToken(token) {
        try {
            const response = await this._apiClient.get(`/sessions/token/${token}`)
            return response.data
        } catch (error) {
            if (error.response?.status === 404) {
                return null
            }
            console.error('Error fetching session by token:', error)
            throw new Error('Failed to fetch session by token')
        }
    }

    /**
     * Invalidate session
     * @param {string} sessionId
     * @returns {Promise<boolean>}
     */
    async invalidate(sessionId) {
        try {
            await this._apiClient.post(`/sessions/${sessionId}/invalidate`)
            return true
        } catch (error) {
            console.error('Error invalidating session:', error)
            throw new Error('Failed to invalidate session')
        }
    }

    /**
     * Clean up expired sessions
     * @returns {Promise<number>} Number of sessions cleaned up
     */
    async cleanupExpired() {
        try {
            const response = await this._apiClient.post('/sessions/cleanup')
            return response.data.cleanedUp
        } catch (error) {
            console.error('Error cleaning up expired sessions:', error)
            throw new Error('Failed to cleanup expired sessions')
        }
    }

    /**
     * Extend session
     * @param {string} sessionId
     * @param {number} durationMinutes
     * @returns {Promise<Session>}
     */
    async extend(sessionId, durationMinutes) {
        try {
            const response = await this._apiClient.post(`/sessions/${sessionId}/extend`, { durationMinutes })
            return response.data
        } catch (error) {
            console.error('Error extending session:', error)
            throw new Error('Failed to extend session')
        }
    }
}
