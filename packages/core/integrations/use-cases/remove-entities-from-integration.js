const {
    assertEntityIdsInput,
    integrationNotFound,
} = require('../utils/assert-entity-ids-input');

/**
 * Detaches entities from an integration. Entities that are not attached are
 * ignored, and detached entities are not deleted.
 * @class RemoveEntitiesFromIntegration
 */
class RemoveEntitiesFromIntegration {
    /**
     * @param {Object} params
     * @param {import('../repositories/integration-repository-interface').IntegrationRepositoryInterface} params.integrationRepository
     */
    constructor({ integrationRepository }) {
        this.integrationRepository = integrationRepository;
    }

    /**
     * @param {string} integrationId
     * @param {string[]} entityIds
     * @returns {Promise<Object>} The updated integration record.
     */
    async execute(integrationId, entityIds) {
        assertEntityIdsInput(integrationId, entityIds);

        const updated =
            await this.integrationRepository.removeEntitiesFromIntegration(
                integrationId,
                entityIds
            );
        if (!updated) throw integrationNotFound(integrationId);
        return updated;
    }
}

module.exports = { RemoveEntitiesFromIntegration };
