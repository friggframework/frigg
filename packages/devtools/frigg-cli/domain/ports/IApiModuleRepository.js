/**
 * IApiModuleRepository Port (Interface)
 *
 * Defines the contract for ApiModule persistence
 * Concrete implementations will be in the infrastructure layer
 */
class IApiModuleRepository {
    /**
     * Save an API module
     * @param {ApiModule} apiModule
     * @returns {Promise<ApiModule>}
     */
    async save(apiModule) {
        throw new Error('Not implemented');
    }

    /**
     * Find API module by name
     * @param {string} name
     * @returns {Promise<ApiModule|null>}
     */
    async findByName(name) {
        throw new Error('Not implemented');
    }

    /**
     * Check if API module exists
     * @param {string} name
     * @returns {Promise<boolean>}
     */
    async exists(name) {
        throw new Error('Not implemented');
    }

    /**
     * List all API modules
     * @returns {Promise<Array<ApiModule>>}
     */
    async list() {
        throw new Error('Not implemented');
    }

    /**
     * Delete an API module
     * @param {string} name
     * @returns {Promise<boolean>}
     */
    async delete(name) {
        throw new Error('Not implemented');
    }
}

module.exports = {IApiModuleRepository};
