// Removed Integration wrapper - using IntegrationBase directly
const {
    mapIntegrationClassToIntegrationDTO,
} = require('../utils/map-integration-dto');

/**
 * Use case for updating a single integration by ID and user.
 * @class UpdateIntegration
 */
class UpdateIntegration {
    /**
     * Creates a new UpdateIntegration instance.
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
     * Executes the integration update process.
     * @async
     * @param {string} integrationId - ID of the integration to update.
     * @param {string} userId - ID of the user requesting the update.
     * @param {Object} config - New configuration object for the integration.
     * @returns {Promise<Object>} The updated integration DTO.
     * @throws {Error} When integration is not found, doesn't belong to user, or integration class is not found.
     */
    async execute(integrationId, userId, config) {
        // 1. Get integration record from repository
        const integrationRecord =
            await this.integrationRepository.findIntegrationById(integrationId);

        if (!integrationRecord) {
            throw new Error(
                `No integration found by the ID of ${integrationId}`
            );
        }

        // 2. Get the correct Integration class by type
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

        // 3. Load modules based on entity references
        const modules = [];
        for (const entityId of integrationRecord.entitiesIds) {
            const moduleInstance = await this.moduleFactory.getModuleInstance(
                entityId,
                integrationRecord.userId
            );
            modules.push(moduleInstance);
        }

        // 4. Create the Integration domain entity with modules and updated config
        const integrationInstance = new integrationClass({
            id: integrationRecord.id,
            userId: integrationRecord.userId,
            entities: integrationRecord.entitiesIds,
            config: config,
            status: integrationRecord.status,
            version: integrationRecord.version,
            messages: integrationRecord.messages,
            modules,
        });

        // 6. Complete async initialization (load dynamic actions, register handlers)
        await integrationInstance.initialize();
        await integrationInstance.send('ON_UPDATE', { config });

        return mapIntegrationClassToIntegrationDTO(integrationInstance);
    }
}

module.exports = { UpdateIntegration };
