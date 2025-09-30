const { IntegrationMapping } = require('./integration-mapping');

/**
 * Repository for Integration Mapping operations.
 * Handles persistence of integration mappings used for data transformation.
 */
class IntegrationMappingRepository {
    /**
     * Find mapping by integration ID and source ID
     * @param {string} integrationId - The integration ID
     * @param {string} sourceId - The source ID for lookup
     * @returns {Promise<Object|null>} The mapping object or null
     */
    async findMappingBy(integrationId, sourceId) {
        return await IntegrationMapping.findBy(integrationId, sourceId);
    }

    /**
     * Create or update a mapping
     * @param {string} integrationId - The integration ID
     * @param {string} sourceId - The source ID for lookup
     * @param {Object} mapping - The mapping data
     * @returns {Promise<Object>} The created or updated mapping document
     */
    async upsertMapping(integrationId, sourceId, mapping) {
        return await IntegrationMapping.upsert(integrationId, sourceId, mapping);
    }

    /**
     * Find all mappings for an integration
     * @param {string} integrationId - The integration ID
     * @returns {Promise<Array>} Array of mapping documents
     */
    async findMappingsByIntegration(integrationId) {
        return await IntegrationMapping.find({ integration: integrationId });
    }

    /**
     * Delete a mapping by integration and source ID
     * @param {string} integrationId - The integration ID
     * @param {string} sourceId - The source ID
     * @returns {Promise<Object>} The deletion result
     */
    async deleteMapping(integrationId, sourceId) {
        return await IntegrationMapping.deleteOne({
            integration: integrationId,
            sourceId,
        });
    }

    /**
     * Delete all mappings for an integration
     * @param {string} integrationId - The integration ID
     * @returns {Promise<Object>} The deletion result
     */
    async deleteMappingsByIntegration(integrationId) {
        return await IntegrationMapping.deleteMany({
            integration: integrationId,
        });
    }
}

module.exports = { IntegrationMappingRepository };