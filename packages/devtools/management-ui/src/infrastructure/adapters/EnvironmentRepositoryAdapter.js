/**
 * EnvironmentRepositoryAdapter
 * Concrete implementation of EnvironmentRepository interface
 */
import { EnvironmentRepository } from '../../domain/interfaces/EnvironmentRepository.js'
import { Environment } from '../../domain/entities/Environment.js'

export class EnvironmentRepositoryAdapter extends EnvironmentRepository {
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
     * Get all environments
     * @returns {Promise<Environment[]>}
     */
    async getAll() {
        try {
            const response = await this._apiClient.get('/environments')
            return response.data.map(envData => new Environment(envData))
        } catch (error) {
            console.error('Error fetching environments:', error)
            throw new Error('Failed to fetch environments')
        }
    }

    /**
     * Get environment by ID
     * @param {string} environmentId
     * @returns {Promise<Environment|null>}
     */
    async getById(environmentId) {
        try {
            const response = await this._apiClient.get(`/environments/${environmentId}`)
            return new Environment(response.data)
        } catch (error) {
            if (error.response?.status === 404) {
                return null
            }
            console.error('Error fetching environment:', error)
            throw new Error('Failed to fetch environment')
        }
    }

    /**
     * Get environment by name
     * @param {string} name
     * @returns {Promise<Environment|null>}
     */
    async getByName(name) {
        try {
            const response = await this._apiClient.get(`/environments/name/${name}`)
            return new Environment(response.data)
        } catch (error) {
            if (error.response?.status === 404) {
                return null
            }
            console.error('Error fetching environment by name:', error)
            throw new Error('Failed to fetch environment by name')
        }
    }

    /**
     * Create new environment
     * @param {Object} environmentData
     * @returns {Promise<Environment>}
     */
    async create(environmentData) {
        try {
            const response = await this._apiClient.post('/environments', environmentData)
            return new Environment(response.data)
        } catch (error) {
            console.error('Error creating environment:', error)
            throw new Error('Failed to create environment')
        }
    }

    /**
     * Update environment
     * @param {string} environmentId
     * @param {Object} environmentData
     * @returns {Promise<Environment>}
     */
    async update(environmentId, environmentData) {
        try {
            const response = await this._apiClient.put(`/environments/${environmentId}`, environmentData)
            return new Environment(response.data)
        } catch (error) {
            console.error('Error updating environment:', error)
            throw new Error('Failed to update environment')
        }
    }

    /**
     * Delete environment
     * @param {string} environmentId
     * @returns {Promise<boolean>}
     */
    async delete(environmentId) {
        try {
            await this._apiClient.delete(`/environments/${environmentId}`)
            return true
        } catch (error) {
            console.error('Error deleting environment:', error)
            throw new Error('Failed to delete environment')
        }
    }

    /**
     * Get active environments
     * @returns {Promise<Environment[]>}
     */
    async getActive() {
        try {
            const response = await this._apiClient.get('/environments/active')
            return response.data.map(envData => new Environment(envData))
        } catch (error) {
            console.error('Error fetching active environments:', error)
            throw new Error('Failed to fetch active environments')
        }
    }

    /**
     * Get environments by type
     * @param {string} type
     * @returns {Promise<Environment[]>}
     */
    async getByType(type) {
        try {
            const response = await this._apiClient.get(`/environments/type/${type}`)
            return response.data.map(envData => new Environment(envData))
        } catch (error) {
            console.error('Error fetching environments by type:', error)
            throw new Error('Failed to fetch environments by type')
        }
    }

    /**
     * Update environment variables
     * @param {string} environmentId
     * @param {Object} variables
     * @returns {Promise<Environment>}
     */
    async updateVariables(environmentId, variables) {
        try {
            const response = await this._apiClient.put(`/environments/${environmentId}/variables`, { variables })
            return new Environment(response.data)
        } catch (error) {
            console.error('Error updating environment variables:', error)
            throw new Error('Failed to update environment variables')
        }
    }

    /**
     * Update environment secrets
     * @param {string} environmentId
     * @param {Object} secrets
     * @returns {Promise<Environment>}
     */
    async updateSecrets(environmentId, secrets) {
        try {
            const response = await this._apiClient.put(`/environments/${environmentId}/secrets`, { secrets })
            return new Environment(response.data)
        } catch (error) {
            console.error('Error updating environment secrets:', error)
            throw new Error('Failed to update environment secrets')
        }
    }
}
