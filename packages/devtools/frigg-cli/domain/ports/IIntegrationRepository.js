/**
 * Integration Repository Port (Interface)
 * Defines the contract for persisting Integration entities
 * Implementation will be in infrastructure layer
 */
class IIntegrationRepository {
    /**
     * Save an integration (create or update)
     * @param {Integration} integration - The integration entity to save
     * @returns {Promise<Integration>} The saved integration
     */
    async save(integration) {
        throw new Error('Not implemented: save must be implemented by concrete repository');
    }

    /**
     * Find integration by ID
     * @param {IntegrationId|string} id - The integration ID
     * @returns {Promise<Integration|null>} The integration or null if not found
     */
    async findById(id) {
        throw new Error('Not implemented: findById must be implemented by concrete repository');
    }

    /**
     * Find integration by name
     * @param {IntegrationName|string} name - The integration name
     * @returns {Promise<Integration|null>} The integration or null if not found
     */
    async findByName(name) {
        throw new Error('Not implemented: findByName must be implemented by concrete repository');
    }

    /**
     * Check if integration exists by name
     * @param {IntegrationName|string} name - The integration name
     * @returns {Promise<boolean>} True if exists, false otherwise
     */
    async exists(name) {
        throw new Error('Not implemented: exists must be implemented by concrete repository');
    }

    /**
     * List all integrations
     * @returns {Promise<Integration[]>} Array of all integrations
     */
    async list() {
        throw new Error('Not implemented: list must be implemented by concrete repository');
    }

    /**
     * Delete an integration by ID
     * @param {IntegrationId|string} id - The integration ID
     * @returns {Promise<boolean>} True if deleted, false if not found
     */
    async delete(id) {
        throw new Error('Not implemented: delete must be implemented by concrete repository');
    }
}

module.exports = {IIntegrationRepository};
