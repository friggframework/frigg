const Boom = require('@hapi/boom');
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
     * @throws {Boom.notFound} When integration is not found or doesn't belong to user.
     * @throws {Error} When integration class is not found.
     */
    async execute(integrationId, userId) {
        const integrationRecord = await this.integrationRepository
            .findIntegrationById(integrationId)
            .catch((error) => {
                if (error.message?.includes('not found')) return null;
                throw error;
            });

        if (!integrationRecord || integrationRecord.userId !== userId) {
            throw Boom.notFound(
                `Integration with id of ${integrationId} does not exist`
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
