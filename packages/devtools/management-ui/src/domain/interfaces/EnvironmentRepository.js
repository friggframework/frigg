/**
 * EnvironmentRepository Interface (Port)
 * Defines the contract for environment data access
 */
export class EnvironmentRepository {
    /**
     * Get all environments
     * @returns {Promise<Environment[]>}
     */
    async getAll() {
        throw new Error('Method getAll must be implemented')
    }

    /**
     * Get environment by ID
     * @param {string} environmentId
     * @returns {Promise<Environment|null>}
     */
    async getById(environmentId) {
        throw new Error('Method getById must be implemented')
    }

    /**
     * Get environment by name
     * @param {string} name
     * @returns {Promise<Environment|null>}
     */
    async getByName(name) {
        throw new Error('Method getByName must be implemented')
    }

    /**
     * Create new environment
     * @param {Object} environmentData
     * @returns {Promise<Environment>}
     */
    async create(environmentData) {
        throw new Error('Method create must be implemented')
    }

    /**
     * Update environment
     * @param {string} environmentId
     * @param {Object} environmentData
     * @returns {Promise<Environment>}
     */
    async update(environmentId, environmentData) {
        throw new Error('Method update must be implemented')
    }

    /**
     * Delete environment
     * @param {string} environmentId
     * @returns {Promise<boolean>}
     */
    async delete(environmentId) {
        throw new Error('Method delete must be implemented')
    }

    /**
     * Get active environments
     * @returns {Promise<Environment[]>}
     */
    async getActive() {
        throw new Error('Method getActive must be implemented')
    }

    /**
     * Get environments by type
     * @param {string} type
     * @returns {Promise<Environment[]>}
     */
    async getByType(type) {
        throw new Error('Method getByType must be implemented')
    }

    /**
     * Update environment variables
     * @param {string} environmentId
     * @param {Object} variables
     * @returns {Promise<Environment>}
     */
    async updateVariables(environmentId, variables) {
        throw new Error('Method updateVariables must be implemented')
    }

    /**
     * Update environment secrets
     * @param {string} environmentId
     * @param {Object} secrets
     * @returns {Promise<Environment>}
     */
    async updateSecrets(environmentId, secrets) {
        throw new Error('Method updateSecrets must be implemented')
    }
}
