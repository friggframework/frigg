const {
    assertEntityIdsInput,
    integrationNotFound,
} = require('../utils/assert-entity-ids-input');

/**
 * Attaches entities to an existing integration, e.g. when a user grants
 * access to more accounts after the integration was created. Every entity
 * must exist, belong to the integration's user, and be of a module the
 * integration already holds (so hydration can load it). Entities that are
 * already attached are left as they are.
 * @class AddEntitiesToIntegration
 */
class AddEntitiesToIntegration {
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

        const entities = await this.moduleRepository.findEntitiesByIds(
            entityIds
        );
        const foundIds = new Set(entities.map((e) => String(e.id)));
        const missing = entityIds.filter((id) => !foundIds.has(String(id)));
        if (missing.length > 0) {
            const error = new Error(
                `Entities not found: ${missing.join(', ')}`
            );
            error.code = 'ENTITIES_NOT_FOUND';
            throw error;
        }

        const foreign = entities.filter(
            (e) => String(e.userId) !== String(integration.userId)
        );
        if (foreign.length > 0) {
            const error = new Error(
                `Entities do not belong to the integration's user: ${foreign
                    .map((e) => e.id)
                    .join(', ')}`
            );
            error.code = 'ENTITY_USER_MISMATCH';
            throw error;
        }

        const attached = await this.moduleRepository.findEntitiesByIds(
            integration.entitiesIds ?? []
        );
        const heldModules = new Set(attached.map((e) => e.moduleName));
        const otherModules = entities.filter(
            (e) => !heldModules.has(e.moduleName)
        );
        if (otherModules.length > 0) {
            const error = new Error(
                `Entities belong to a module the integration does not hold: ${otherModules
                    .map((e) => `${e.id} (${e.moduleName})`)
                    .join(', ')}`
            );
            error.code = 'ENTITY_MODULE_MISMATCH';
            throw error;
        }

        const updated =
            await this.integrationRepository.addEntitiesToIntegration(
                integrationId,
                entityIds
            );
        if (!updated) throw integrationNotFound(integrationId);
        return updated;
    }
}

module.exports = { AddEntitiesToIntegration };
