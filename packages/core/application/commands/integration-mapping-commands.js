const {
    createIntegrationMappingRepository,
} = require('../../integrations/repositories/integration-mapping-repository-factory');

function mapErrorToResponse(error) {
    return { error: 500, reason: error?.message, code: error?.code };
}

// Kept separate from integration-commands so the mapping and integration domains stay decoupled.
function createIntegrationMappingCommands() {
    const mappingRepository = createIntegrationMappingRepository();

    return {
        // Returns a Map of integrationId → count, or an error object on failure.
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
