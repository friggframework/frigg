/**
 * UserRepositoryAdapter
 * Concrete implementation of UserRepository interface
 */
import { UserRepository } from '../../domain/interfaces/UserRepository.js'
import { User } from '../../domain/entities/User.js'

export class UserRepositoryAdapter extends UserRepository {
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
     * Get all users
     * @returns {Promise<User[]>}
     */
    async getAll() {
        try {
            const response = await this._apiClient.get('/api/project/users')
            return response.data.map(userData => new User(userData))
        } catch (error) {
            console.error('Error fetching users:', error)
            throw new Error('Failed to fetch users')
        }
    }

    /**
     * Get user by ID
     * @param {string} userId
     * @returns {Promise<User|null>}
     */
    async getById(userId) {
        try {
            const response = await this._apiClient.get(`/users/${userId}`)
            return new User(response.data)
        } catch (error) {
            if (error.response?.status === 404) {
                return null
            }
            console.error('Error fetching user:', error)
            throw new Error('Failed to fetch user')
        }
    }

    /**
     * Create new user
     * @param {Object} userData
     * @returns {Promise<User>}
     */
    async create(userData) {
        try {
            const response = await this._apiClient.post('/users', userData)
            return new User(response.data)
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
    async update(userId, userData) {
        try {
            const response = await this._apiClient.put(`/users/${userId}`, userData)
            return new User(response.data)
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
    async delete(userId) {
        try {
            await this._apiClient.delete(`/users/${userId}`)
            return true
        } catch (error) {
            console.error('Error deleting user:', error)
            throw new Error('Failed to delete user')
        }
    }

    /**
     * Bulk create users
     * @param {number} count
     * @returns {Promise<User[]>}
     */
    async bulkCreate(count) {
        try {
            const response = await this._apiClient.post('/users/bulk', { count })
            return response.data.map(userData => new User(userData))
        } catch (error) {
            console.error('Error bulk creating users:', error)
            throw new Error('Failed to bulk create users')
        }
    }

    /**
     * Delete all users
     * @returns {Promise<boolean>}
     */
    async deleteAll() {
        try {
            await this._apiClient.delete('/users')
            return true
        } catch (error) {
            console.error('Error deleting all users:', error)
            throw new Error('Failed to delete all users')
        }
    }
}
