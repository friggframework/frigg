const { Integration } = require('../integration');
const { mapIntegrationClassToIntegrationDTO } = require('../utils/map-integration-dto');

class CreateIntegration {
    /**
     * @param {Object} params
     * @param {import('../integration-repository').IntegrationRepository} params.integrationRepository
     * @param {import('../integration-classes').IntegrationClasses} params.integrationClasses
     * @param {import('../../module-plugin/module-service').ModuleService} params.moduleService
     */
    constructor({ integrationRepository, integrationClasses, moduleService }) {
        this.integrationRepository = integrationRepository;
        this.integrationClasses = integrationClasses;
        this.moduleService = moduleService;
    }

    async execute(entities, userId, config) {
        const integrationRecord = await this.integrationRepository.createIntegration(entities, userId, config);


        // 2. Get the correct Integration class by type
        const integrationClass = this.integrationClasses.find(
            (integrationClass) => integrationClass.Definition.name === integrationRecord.config.type
        );

        if (!integrationClass) {
            throw new Error(`No integration class found for type: ${integrationRecord.config.type}`);
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
        await integrationInstance.send('ON_CREATE', {});

        return mapIntegrationClassToIntegrationDTO(integrationInstance);
    }
}

module.exports = { CreateIntegration }; 