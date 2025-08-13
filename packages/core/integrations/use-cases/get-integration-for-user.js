const { Integration } = require('../integration');
const { mapIntegrationClassToIntegrationDTO } = require('../utils/map-integration-dto');

class GetIntegrationForUser {
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
     * @param {string} integrationId
     * @param {string} userId
     * @returns {Promise<Integration>}
     */
    async execute(integrationId, userId) {
        const integrationRecord = await this.integrationRepository.findIntegrationById(integrationId);
        const entities = await this.moduleRepository.findEntitiesByIds(integrationRecord.entitiesIds);

        if (!integrationRecord) {
            throw Boom.notFound(`Integration with id of ${integrationId} does not exist`);
        }

        if (integrationRecord.user.toString() !== userId.toString()) {
            throw Boom.forbidden('User does not have access to this integration');
        }

        const integrationClass = this.integrationClasses.find(
            (integrationClass) => integrationClass.Definition.name === integrationRecord.config.type
        );

        const modules = [];
        for (const entity of entities) {
            const moduleInstance = await this.moduleService.getModuleInstance(
                entity._id,
                integrationRecord.user
            );
            modules.push(moduleInstance);
        }

        const integrationInstance = new Integration({
            id: integrationRecord._id,
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

        return mapIntegrationClassToIntegrationDTO(integrationInstance);
    }
}

module.exports = { GetIntegrationForUser }; 