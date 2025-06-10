const { Integration } = require('../integration');

class GetIntegrationInstance {

    /**
     * @class GetIntegrationInstance
     * @description Use case for retrieving a single integration instance by ID and user.
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

    async execute(integrationId, userId) {
        const integrationRecord = await this.integrationRepository.findIntegrationById(integrationId);

        if (!integrationRecord) {
            throw new Error(`No integration found by the ID of ${integrationId}`);
        }

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


        const modules = [];
        for (const entityId of integrationRecord.entitiesIds) {
            const moduleInstance = await this.moduleService.getModuleInstance(
                entityId,
                integrationRecord.userId
            );
            modules.push(moduleInstance);
        }

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


        await integrationInstance.initialize();

        return integrationInstance;
    }
}

module.exports = { GetIntegrationInstance }; 