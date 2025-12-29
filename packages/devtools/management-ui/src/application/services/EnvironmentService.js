/**
 * EnvironmentService
 * Application service for environment management operations
 */
import { Environment } from '../../domain/entities/Environment.js'

export class EnvironmentService {
    constructor(environmentRepository) {
        this.environmentRepository = environmentRepository
    }

    /**
     * Get all environments
     * @returns {Promise<Environment[]>}
     */
    async getAllEnvironments() {
        try {
            return await this.environmentRepository.getAll()
        } catch (error) {
            console.error('Error getting all environments:', error)
            throw new Error('Failed to get all environments')
        }
    }

    /**
     * Get environment by ID
     * @param {string} environmentId
     * @returns {Promise<Environment|null>}
     */
    async getEnvironmentById(environmentId) {
        try {
            return await this.environmentRepository.getById(environmentId)
        } catch (error) {
            console.error('Error getting environment by ID:', error)
            throw new Error('Failed to get environment by ID')
        }
    }

    /**
     * Get environment by name
     * @param {string} name
     * @returns {Promise<Environment|null>}
     */
    async getEnvironmentByName(name) {
        try {
            return await this.environmentRepository.getByName(name)
        } catch (error) {
            console.error('Error getting environment by name:', error)
            throw new Error('Failed to get environment by name')
        }
    }

    /**
     * Create new environment
     * @param {Object} environmentData
     * @returns {Promise<Environment>}
     */
    async createEnvironment(environmentData) {
        try {
            // Validate environment data
            if (!environmentData.name || !environmentData.type) {
                throw new Error('Name and type are required')
            }

            // Create environment entity
            const environment = new Environment(environmentData)

            // Validate entity
            if (!environment.isValid()) {
                throw new Error('Invalid environment data')
            }

            return await this.environmentRepository.create(environment.toJSON())
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
    async updateEnvironment(environmentId, environmentData) {
        try {
            const existingEnvironment = await this.environmentRepository.getById(environmentId)
            if (!existingEnvironment) {
                throw new Error('Environment not found')
            }

            // Update environment entity
            if (environmentData.config) {
                existingEnvironment.updateConfig(environmentData.config)
            }

            return await this.environmentRepository.update(environmentId, existingEnvironment.toJSON())
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
    async deleteEnvironment(environmentId) {
        try {
            // Check if environment exists
            const environment = await this.environmentRepository.getById(environmentId)
            if (!environment) {
                throw new Error('Environment not found')
            }

            // Prevent deletion of production environment
            if (environment.isProduction()) {
                throw new Error('Cannot delete production environment')
            }

            return await this.environmentRepository.delete(environmentId)
        } catch (error) {
            console.error('Error deleting environment:', error)
            throw new Error('Failed to delete environment')
        }
    }

    /**
     * Get active environments
     * @returns {Promise<Environment[]>}
     */
    async getActiveEnvironments() {
        try {
            return await this.environmentRepository.getActive()
        } catch (error) {
            console.error('Error getting active environments:', error)
            throw new Error('Failed to get active environments')
        }
    }

    /**
     * Get environments by type
     * @param {string} type
     * @returns {Promise<Environment[]>}
     */
    async getEnvironmentsByType(type) {
        try {
            if (!['development', 'staging', 'production'].includes(type)) {
                throw new Error('Invalid environment type')
            }

            return await this.environmentRepository.getByType(type)
        } catch (error) {
            console.error('Error getting environments by type:', error)
            throw new Error('Failed to get environments by type')
        }
    }

    /**
     * Update environment variables
     * @param {string} environmentId
     * @param {Object} variables
     * @returns {Promise<Environment>}
     */
    async updateEnvironmentVariables(environmentId, variables) {
        try {
            const environment = await this.environmentRepository.getById(environmentId)
            if (!environment) {
                throw new Error('Environment not found')
            }

            // Update variables in entity
            Object.entries(variables).forEach(([key, value]) => {
                environment.setVariable(key, value)
            })

            return await this.environmentRepository.updateVariables(environmentId, variables)
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
    async updateEnvironmentSecrets(environmentId, secrets) {
        try {
            const environment = await this.environmentRepository.getById(environmentId)
            if (!environment) {
                throw new Error('Environment not found')
            }

            // Update secrets in entity
            Object.entries(secrets).forEach(([key, value]) => {
                environment.setSecret(key, value)
            })

            return await this.environmentRepository.updateSecrets(environmentId, secrets)
        } catch (error) {
            console.error('Error updating environment secrets:', error)
            throw new Error('Failed to update environment secrets')
        }
    }

    /**
     * Activate environment
     * @param {string} environmentId
     * @returns {Promise<Environment>}
     */
    async activateEnvironment(environmentId) {
        try {
            const environment = await this.environmentRepository.getById(environmentId)
            if (!environment) {
                throw new Error('Environment not found')
            }

            environment.activate()
            return await this.environmentRepository.update(environmentId, environment.toJSON())
        } catch (error) {
            console.error('Error activating environment:', error)
            throw new Error('Failed to activate environment')
        }
    }

    /**
     * Deactivate environment
     * @param {string} environmentId
     * @returns {Promise<Environment>}
     */
    async deactivateEnvironment(environmentId) {
        try {
            const environment = await this.environmentRepository.getById(environmentId)
            if (!environment) {
                throw new Error('Environment not found')
            }

            // Prevent deactivation of production environment
            if (environment.isProduction()) {
                throw new Error('Cannot deactivate production environment')
            }

            environment.deactivate()
            return await this.environmentRepository.update(environmentId, environment.toJSON())
        } catch (error) {
            console.error('Error deactivating environment:', error)
            throw new Error('Failed to deactivate environment')
        }
    }

    /**
     * Update environment variable
     * @param {string} key
     * @param {string} value
     * @returns {Promise<Environment>}
     */
    async updateVariable(key, value) {
        try {
            // For now, we'll update the first available environment
            // In a real implementation, you'd specify which environment to update
            const environments = await this.environmentRepository.getAll()
            if (environments.length === 0) {
                throw new Error('No environments available')
            }

            const environment = environments[0]
            environment.setVariable(key, value)

            return await this.environmentRepository.updateVariables(environment.id, { [key]: value })
        } catch (error) {
            console.error('Error updating environment variable:', error)
            throw new Error('Failed to update environment variable')
        }
    }
}
