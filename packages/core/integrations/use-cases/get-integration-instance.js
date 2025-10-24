// Removed Integration wrapper - using IntegrationBase directly

/**
 * Use case for retrieving a single integration instance by ID and user.
 * @class GetIntegrationInstance
 */
class GetIntegrationInstance {
    /**
     * Creates a new GetIntegrationInstance instance.
     * @param {Object} params - Configuration parameters.
     * @param {import('../repositories/integration-repository-interface').IntegrationRepositoryInterface} params.integrationRepository - Repository for integration data access
     * @param {Array<import('../integration').Integration>} params.integrationClasses - Array of available integration classes
     * @param {import('../../modules/module-factory').ModuleFactory} params.moduleFactory - Service for module instantiation and management
     */
    constructor({ integrationRepository, integrationClasses, moduleFactory }) {
        this.integrationRepository = integrationRepository;
        this.integrationClasses = integrationClasses;
        this.moduleFactory = moduleFactory;
    }

    /**
     * Executes the retrieval of a single integration instance.
     * @async
     * @param {string} integrationId - ID of the integration to retrieve.
     * @param {string} userId - ID of the user requesting the integration.
     * @returns {Promise<Integration>} The fully initialized integration instance.
     * @throws {Error} When integration is not found, doesn't belong to user, or integration class is not found.
     */
    async execute(integrationId, userId) {
        const integrationRecord =
            await this.integrationRepository.findIntegrationById(integrationId);

        if (!integrationRecord) {
            throw new Error(
                `No integration found by the ID of ${integrationId}`
            );
        }

        const integrationClass = this.integrationClasses.find(
            (integrationClass) =>
                integrationClass.Definition.name ===
                integrationRecord.config.type
        );

        if (!integrationClass) {
            throw new Error(
                `No integration class found for type: ${integrationRecord.config.type}`
            );
        }

        if (integrationRecord.userId !== userId) {
            throw new Error(
                `Integration ${integrationId} does not belong to User ${userId}`
            );
        }

        const modules = [];
        for (const entityId of integrationRecord.entitiesIds) {
            const moduleInstance = await this.moduleFactory.getModuleInstance(
                entityId,
                integrationRecord.userId
            );
            modules.push(moduleInstance);
        }

        const integrationInstance = new integrationClass({
            id: integrationRecord.id,
            userId: integrationRecord.userId,
            entities: integrationRecord.entitiesIds,
            config: integrationRecord.config,
            status: integrationRecord.status,
            version: integrationRecord.version,
            messages: integrationRecord.messages,
            modules,
        });

        await integrationInstance.initialize();

        return integrationInstance;
    }
}

module.exports = { GetIntegrationInstance };
