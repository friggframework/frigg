const { Integration } = require('../integration');
const { mapIntegrationClassToIntegrationDTO } = require('../utils/map-integration-dto');

class GetIntegrationsForUser {
    constructor({ integrationRepository, integrationClasses, moduleService, moduleRepository }) {

        /**
         * @type {import('../integration-repository').IntegrationRepository}
         */
        this.integrationRepository = integrationRepository;
        this.integrationClasses = integrationClasses;
        this.moduleService = moduleService;
        this.moduleRepository = moduleRepository;
    }

    /**
     * @param {string} userId
     * @returns {Promise<Integration[]>}
     */
    async execute(userId) {
        const integrationRecords = await this.integrationRepository.findIntegrationsByUserId(userId);

        const integrations = []

        for (const integrationRecord of integrationRecords) {
            const entities = await this.moduleRepository.findEntitiesByIds(integrationRecord.entitiesIds);

            const integrationClass = this.integrationClasses.find(
                (integrationClass) => integrationClass.Definition.name === integrationRecord.config.type
            );

            const modules = [];
            for (const entity of entities) {
                const moduleInstance = await this.moduleService.getModuleInstance(
                    entity.id,
                    integrationRecord.userId
                );
                modules.push(moduleInstance);
            }

            const integrationInstance = new Integration({
                id: integrationRecord.id,
                userId: integrationRecord.user,
                entities: entities,
                config: integrationRecord.config,
                status: integrationRecord.status,
                version: integrationRecord.version,
                messages: integrationRecord.messages,
                entityReference: integrationRecord.entityReference,
                integrationClass: integrationClass,
                modules
            });

            integrations.push(
                mapIntegrationClassToIntegrationDTO(integrationInstance)
            );

        }

        return integrations;
    }
}

module.exports = { GetIntegrationsForUser }; 