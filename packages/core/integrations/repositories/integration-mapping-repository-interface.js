/**
 * Integration Mapping Repository Interface
 * Abstract base class defining the contract for integration mapping persistence adapters
 *
 * This follows the Port in Hexagonal Architecture:
 * - Domain layer depends on this abstraction
 * - Concrete adapters implement this interface
 * - Use cases receive repositories via dependency injection
 *
 * Note: Currently, IntegrationMapping model has identical structure across MongoDB and PostgreSQL,
 * so IntegrationMappingRepository serves both. This interface exists for consistency and
 * future-proofing if database-specific implementations become needed.
 *
 * @abstract
 */
class IntegrationMappingRepositoryInterface {
    /**
     * Find mapping by integration ID and source ID
     *
     * @param {string|number} integrationId - The integration ID
     * @param {string} sourceId - The source ID for lookup
     * @returns {Promise<Object|null>} The mapping object or null
     * @abstract
     */
    async findMappingBy(integrationId, sourceId) {
        throw new Error('Method findMappingBy must be implemented by subclass');
    }

    /**
     * Create or update a mapping
     *
     * @param {string|number} integrationId - The integration ID
     * @param {string} sourceId - The source ID for lookup
     * @param {Object} mapping - The mapping data
     * @returns {Promise<Object>} The created or updated mapping document
     * @abstract
     */
    async upsertMapping(integrationId, sourceId, mapping) {
        throw new Error('Method upsertMapping must be implemented by subclass');
    }

    /**
     * Find all mappings for an integration
     *
     * @param {string|number} integrationId - The integration ID
     * @returns {Promise<Array>} Array of mapping objects
     * @abstract
     */
    async findMappingsByIntegration(integrationId) {
        throw new Error(
            'Method findMappingsByIntegration must be implemented by subclass'
        );
    }

    /**
     * Delete a specific mapping
     *
     * @param {string|number} integrationId - The integration ID
     * @param {string} sourceId - The source ID
     * @returns {Promise<Object>} Deletion result
     * @abstract
     */
    async deleteMapping(integrationId, sourceId) {
        throw new Error('Method deleteMapping must be implemented by subclass');
    }

    /**
     * Delete all mappings for an integration
     *
     * @param {string|number} integrationId - The integration ID
     * @returns {Promise<Object>} Deletion result
     * @abstract
     */
    async deleteMappingsByIntegration(integrationId) {
        throw new Error(
            'Method deleteMappingsByIntegration must be implemented by subclass'
        );
    }

    /**
     * Find mapping by ID
     *
     * @param {string|number} id - The mapping ID
     * @returns {Promise<Object|null>} The mapping object or null
     * @abstract
     */
    async findMappingById(id) {
        throw new Error(
            'Method findMappingById must be implemented by subclass'
        );
    }

    /**
     * Update a mapping by ID
     *
     * @param {string|number} id - The mapping ID
     * @param {Object} updates - Fields to update
     * @returns {Promise<Object>} Updated mapping object
     * @abstract
     */
    async updateMapping(id, updates) {
        throw new Error('Method updateMapping must be implemented by subclass');
    }
}

module.exports = { IntegrationMappingRepositoryInterface };
