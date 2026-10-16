function validate(integrationId, entityIds) {
    if (!integrationId || !Array.isArray(entityIds) || entityIds.length === 0) {
        const error = new Error(
            'integrationId and a non-empty entityIds array are required'
        );
        error.code = 'INVALID_INTEGRATION_DATA';
        throw error;
    }
}

function notFound(integrationId) {
    const error = new Error(`Integration ${integrationId} not found`);
    error.code = 'INTEGRATION_NOT_FOUND';
    return error;
}

/**
 * Attaches entities to an existing integration, e.g. when a user grants
 * access to more accounts after the integration was created. Entities that
 * are already attached are left as they are.
 * @class AddEntitiesToIntegration
 */
class AddEntitiesToIntegration {
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
        validate(integrationId, entityIds);
        const integration =
            await this.integrationRepository.addEntitiesToIntegration(
                integrationId,
                entityIds
            );
        if (!integration) throw notFound(integrationId);
        return integration;
    }
}

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
        validate(integrationId, entityIds);
        const integration =
            await this.integrationRepository.removeEntitiesFromIntegration(
                integrationId,
                entityIds
            );
        if (!integration) throw notFound(integrationId);
        return integration;
    }
}

module.exports = { AddEntitiesToIntegration, RemoveEntitiesFromIntegration };
