const {
    createIntegrationMappingRepository,
} = require('../../integrations/repositories/integration-mapping-repository-factory');

function mapErrorToResponse(error) {
    return { error: 500, reason: error?.message, code: error?.code };
}

/**
 * Class-agnostic integration-mapping read commands.
 *
 * Kept separate from integration-commands (which owns integration records) so
 * the two domains stay decoupled. Reports (ADR-010) consume countByIntegrationIds
 * here rather than reaching into the mapping repository directly.
 *
 * @returns {Object} Command methods for integration mappings
 */
function createIntegrationMappingCommands() {
    const mappingRepository = createIntegrationMappingRepository();

    return {
        /**
         * Count mappings grouped by integration id, for a bounded set of ids.
         * @param {Array<string|number>} ids
         * @returns {Promise<Map<string, number>|Object>} Map of integrationId → count, or an error object.
         */
        async countByIntegrationIds(ids = []) {
            try {
                return await mappingRepository.countByIntegrationIds(ids);
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },
    };
}

module.exports = { createIntegrationMappingCommands };
