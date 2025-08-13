const { Integration } = require('../integration');
const { mapIntegrationClassToIntegrationDTO } = require('../utils/map-integration-dto');


class UpdateIntegration {

    /**
     * @class UpdateIntegration
     * @description Use case for updating a single integration by ID and user.
     * @param {Object} params
     * @param {import('../integration-repository').IntegrationRepository} params.integrationRepository - Repository for integration data access
     * @param {Array<import('../integration').Integration>} params.integrationClasses - Array of available integration classes
     * @param {import('../module-plugin/module-service').ModuleService} params.moduleService - Service for module instantiation and management
     */
    constructor({
        integrationRepository,
        integrationClasses,
        moduleService,
    }) {
        this.integrationRepository = integrationRepository;
        this.integrationClasses = integrationClasses;
        this.moduleService = moduleService;
    }

    async execute(integrationId, userId, config) {
        // 1. Get integration record from repository
        const integrationRecord = await this.integrationRepository.findIntegrationById(integrationId);

        if (!integrationRecord) {
            throw new Error(`No integration found by the ID of ${integrationId}`);
        }

        // 2. Get the correct Integration class by type
        const integrationClass = this.integrationClasses.find(
            (integrationClass) => integrationClass.Definition.name === integrationRecord.config.type
        );

        if (!integrationClass) {
            throw new Error(`No integration class found for type: ${integrationRecord.config.type}`);
        }

        if (integrationRecord.userId !== userId) {
            throw new Error(
                `Integration ${integrationId} does not belong to User ${userId}`
            );
        }


        // 3. Load modules based on entity references
        const modules = [];
        for (const entityId of integrationRecord.entitiesIds) {
            const moduleInstance = await this.moduleService.getModuleInstance(
                entityId,
                integrationRecord.userId
            );
            modules.push(moduleInstance);
        }

        // 4. Create the Integration domain entity with modules
        const integrationInstance = new Integration({
            id: integrationRecord.id,
            userId: integrationRecord.userId,
            entities: integrationRecord.entitiesIds,
            config: integrationRecord.config,
            status: integrationRecord.status,
            version: integrationRecord.version,
            messages: integrationRecord.messages,
            integrationClass: integrationClass,
            modules
        });


        // 6. Complete async initialization (load dynamic actions, register handlers)
        await integrationInstance.initialize();
        await integrationInstance.send('ON_UPDATE', { config });

        return mapIntegrationClassToIntegrationDTO(integrationInstance);
    }
}

module.exports = { UpdateIntegration }; 