const {
    assertEntityIdsInput,
    integrationNotFound,
} = require('../utils/assert-entity-ids-input');

/**
 * Detaches entities from an integration. Entities that are not attached are
 * ignored, and detached entities are not deleted. Every module the
 * integration holds must keep at least one entity, so the integration can
 * still hydrate each of its modules.
 * @class RemoveEntitiesFromIntegration
 */
class RemoveEntitiesFromIntegration {
    /**
     * @param {Object} params
     * @param {import('../repositories/integration-repository-interface').IntegrationRepositoryInterface} params.integrationRepository
     * @param {import('../../modules/repositories/module-repository-interface').ModuleRepositoryInterface} params.moduleRepository
     */
    constructor({ integrationRepository, moduleRepository }) {
        this.integrationRepository = integrationRepository;
        this.moduleRepository = moduleRepository;
    }

    /**
     * @param {string} integrationId
     * @param {string[]} entityIds
     * @returns {Promise<Object>} The updated integration record.
     */
    async execute(integrationId, entityIds) {
        assertEntityIdsInput(integrationId, entityIds);

        const integration = await this.integrationRepository
            .findIntegrationById(integrationId)
            .catch(() => null);
        if (!integration) throw integrationNotFound(integrationId);

        const removing = new Set(entityIds.map(String));
        const attached = await this.moduleRepository.findEntitiesByIds(
            integration.entitiesIds ?? []
        );
        const emptied = [...new Set(attached.map((e) => e.moduleName))].filter(
            (moduleName) =>
                !attached.some(
                    (e) =>
                        e.moduleName === moduleName &&
                        !removing.has(String(e.id))
                )
        );
        if (emptied.length > 0) {
            const error = new Error(
                `Removing these entities would leave no entity for module(s): ${emptied.join(
                    ', '
                )}`
            );
            error.code = 'LAST_ENTITY_OF_MODULE';
            throw error;
        }

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
