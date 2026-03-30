/**
 * UserService
 * Application service for user management operations
 */
import { User } from '../../domain/entities/User.js'

export class UserService {
    constructor(userRepository, sessionRepository) {
        this.userRepository = userRepository
        this.sessionRepository = sessionRepository
    }

    /**
     * Get all users
     * @returns {Promise<User[]>}
     */
    async getAllUsers() {
        try {
            return await this.userRepository.getAll()
        } catch (error) {
            console.error('Error getting all users:', error)
            throw new Error('Failed to get all users')
        }
    }

    /**
     * Get all users (alias for getAllUsers for compatibility)
     * @returns {Promise<User[]>}
     */
    async listUsers() {
        return this.getAllUsers()
    }

    /**
     * Get user by ID
     * @param {string} userId
     * @returns {Promise<User|null>}
     */
    async getUserById(userId) {
        try {
            return await this.userRepository.getById(userId)
        } catch (error) {
            console.error('Error getting user by ID:', error)
            throw new Error('Failed to get user by ID')
        }
    }

    /**
     * Create new user
     * @param {Object} userData
     * @returns {Promise<User>}
     */
    async createUser(userData) {
        try {
            // Validate user data
            if (!userData.name || !userData.email) {
                throw new Error('Name and email are required')
            }

            // Create user entity
            const user = new User(userData)

            // Validate entity
            if (!user.isValid()) {
                throw new Error('Invalid user data')
            }

            return await this.userRepository.create(user.toJSON())
        } catch (error) {
            console.error('Error creating user:', error)
            throw new Error('Failed to create user')
        }
    }

    /**
     * Update user
     * @param {string} userId
     * @param {Object} userData
     * @returns {Promise<User>}
     */
    async updateUser(userId, userData) {
        try {
            const existingUser = await this.userRepository.getById(userId)
            if (!existingUser) {
                throw new Error('User not found')
            }

            // Update user entity
            existingUser.updateProfile(userData)

            return await this.userRepository.update(userId, existingUser.toJSON())
        } catch (error) {
            console.error('Error updating user:', error)
            throw new Error('Failed to update user')
        }
    }

    /**
     * Delete user
     * @param {string} userId
     * @returns {Promise<boolean>}
     */
    async deleteUser(userId) {
        try {
            // Check if user exists
            const user = await this.userRepository.getById(userId)
            if (!user) {
                throw new Error('User not found')
            }

            // Invalidate all user sessions
            const sessions = await this.sessionRepository.getByUserId(userId)
            for (const session of sessions) {
                await this.sessionRepository.invalidate(session.id)
            }

            return await this.userRepository.delete(userId)
        } catch (error) {
            console.error('Error deleting user:', error)
            throw new Error('Failed to delete user')
        }
    }

    /**
     * Activate user
     * @param {string} userId
     * @returns {Promise<User>}
     */
    async activateUser(userId) {
        try {
            const user = await this.userRepository.getById(userId)
            if (!user) {
                throw new Error('User not found')
            }

            user.activate()
            return await this.userRepository.update(userId, user.toJSON())
        } catch (error) {
            console.error('Error activating user:', error)
            throw new Error('Failed to activate user')
        }
    }

    /**
     * Deactivate user
     * @param {string} userId
     * @returns {Promise<User>}
     */
    async deactivateUser(userId) {
        try {
            const user = await this.userRepository.getById(userId)
            if (!user) {
                throw new Error('User not found')
            }

            user.deactivate()

            // Invalidate all user sessions
            const sessions = await this.sessionRepository.getByUserId(userId)
            for (const session of sessions) {
                await this.sessionRepository.invalidate(session.id)
            }

            return await this.userRepository.update(userId, user.toJSON())
        } catch (error) {
            console.error('Error deactivating user:', error)
            throw new Error('Failed to deactivate user')
        }
    }

    /**
     * Update user role
     * @param {string} userId
     * @param {string} role
     * @returns {Promise<User>}
     */
    async updateUserRole(userId, role) {
        try {
            const user = await this.userRepository.getById(userId)
            if (!user) {
                throw new Error('User not found')
            }

            user.updateRole(role)
            return await this.userRepository.update(userId, user.toJSON())
        } catch (error) {
            console.error('Error updating user role:', error)
            throw new Error('Failed to update user role')
        }
    }

    /**
     * Bulk create users
     * @param {number} count
     * @returns {Promise<User[]>}
     */
    async bulkCreateUsers(count) {
        try {
            if (count <= 0 || count > 100) {
                throw new Error('Count must be between 1 and 100')
            }

            return await this.userRepository.bulkCreate(count)
        } catch (error) {
            console.error('Error bulk creating users:', error)
            throw new Error('Failed to bulk create users')
        }
    }

    /**
     * Create session for user
     * @param {string} userId
     * @param {Object} metadata
     * @returns {Promise<Session>}
     */
    async createSession(userId, metadata = {}) {
        try {
            const sessionData = {
                userId,
                metadata,
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
            }
            return await this.sessionRepository.create(sessionData)
        } catch (error) {
            console.error('Error creating session:', error)
            throw new Error('Failed to create session')
        }
    }

    /**
     * Get user sessions
     * @param {string} userId
     * @returns {Promise<Session[]>}
     */
    async getUserSessions(userId) {
        try {
            return await this.sessionRepository.getByUserId(userId)
        } catch (error) {
            console.error('Error getting user sessions:', error)
            throw new Error('Failed to get user sessions')
        }
    }

    /**
     * Track session activity
     * @param {string} sessionId
     * @param {string} action
     * @param {Object} data
     * @returns {Promise<Session>}
     */
    async trackSessionActivity(sessionId, action, data = {}) {
        try {
            const session = await this.sessionRepository.getById(sessionId)
            if (!session) {
                throw new Error('Session not found')
            }

            // Update session with activity
            const updatedSession = {
                ...session,
                lastActivity: new Date(),
                activityLog: [...(session.activityLog || []), { action, data, timestamp: new Date() }]
            }

            return await this.sessionRepository.update(sessionId, updatedSession)
        } catch (error) {
            console.error('Error tracking session activity:', error)
            throw new Error('Failed to track session activity')
        }
    }

    /**
     * End session
     * @param {string} sessionId
     * @returns {Promise<boolean>}
     */
    async endSession(sessionId) {
        try {
            return await this.sessionRepository.invalidate(sessionId)
        } catch (error) {
            console.error('Error ending session:', error)
            throw new Error('Failed to end session')
        }
    }
}
