// Removed Integration wrapper - using IntegrationBase directly
const { mapIntegrationClassToIntegrationDTO } = require('../utils/map-integration-dto');

/**
 * Use case for creating a new integration instance.
 * @class CreateIntegration
 */
class CreateIntegration {
    /**
     * Creates a new CreateIntegration instance.
     * @param {Object} params - Configuration parameters.
     * @param {import('../integration-repository').IntegrationRepository} params.integrationRepository - Repository for integration data operations.
     * @param {import('../integration-classes').IntegrationClasses} params.integrationClasses - Array of available integration classes.
     * @param {import('../../modules/module-factory').ModuleFactory} params.moduleFactory - Service for module instantiation and management.
     */
    constructor({ integrationRepository, integrationClasses, moduleFactory }) {
        this.integrationRepository = integrationRepository;
        this.integrationClasses = integrationClasses;
        this.moduleFactory = moduleFactory;
    }

    /**
     * Executes the integration creation process.
     * @async
     * @param {string[]} entities - Array of entity IDs to associate with the integration.
     * @param {string} userId - ID of the user creating the integration.
     * @param {Object} config - Configuration object for the integration.
     * @param {string} config.type - Type of integration to create.
     * @returns {Promise<Object>} The created integration DTO.
     * @throws {Error} When integration class is not found for the specified type.
     */
    async execute(entities, userId, config) {
        const integrationRecord = await this.integrationRepository.createIntegration(entities, userId, config);


        const integrationClass = this.integrationClasses.find(
            (integrationClass) => integrationClass.Definition.name === integrationRecord.config.type
        );

        if (!integrationClass) {
            throw new Error(`No integration class found for type: ${integrationRecord.config.type}`);
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
            modules
        });

        await integrationInstance.initialize();
        await integrationInstance.send('ON_CREATE', { integrationId: integrationRecord.id });

        return mapIntegrationClassToIntegrationDTO(integrationInstance);
    }
}

module.exports = { CreateIntegration }; 