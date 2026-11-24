// Removed Integration wrapper - using IntegrationBase directly
const Boom = require('@hapi/boom');

/**
 * Use case for retrieving a single integration by definition.
 * @class GetIntegrationByDefinition
 */
class GetIntegrationInstanceByDefinition {
    /**
     * Creates a new GetIntegrationByDefinition instance.
     * @param {Object} params - Configuration parameters.
     * @param {import('../integration-repository-interface').IntegrationRepositoryInterface} params.integrationRepository - Repository for integration data operations.
     * @param {import('../../modules/module-factory').ModuleFactory} params.moduleFactory - Service for module instantiation and management.
     * @param {import('../../modules/module-repository-interface').ModuleRepositoryInterface} params.moduleRepository - Repository for module and entity data operations.
     */
    constructor({ integrationRepository, moduleFactory, moduleRepository }) {

        /**
         * @type {import('../integration-repository-interface').IntegrationRepositoryInterface}
         */
        this.integrationRepository = integrationRepository;
        this.moduleFactory = moduleFactory;
        this.moduleRepository = moduleRepository;
    }

    /**
     * Executes the retrieval of a single integration by definition.
     * @async
     * @returns {Promise<Object>} The integration DTO for the specified definition.
     * @throws {Boom.notFound} When integration with the specified definition does not exist.
     */
    async execute(integrationClass) {
        const integrationRecord = await this.integrationRepository.findIntegrationByName(integrationClass.Definition.name);

        if (!integrationRecord) {
            throw Boom.notFound(`Integration with name of ${integrationClass.Definition.name} does not exist`);
        }

        const entities = await this.moduleRepository.findEntitiesByIds(integrationRecord.entitiesIds);

        const modules = [];
        for (const entity of entities) {
            const moduleInstance = await this.moduleFactory.getModuleInstance(
                entity.id,
                integrationRecord.userId
            );
            modules.push(moduleInstance);
        }

        const integrationInstance = new integrationClass({
            id: integrationRecord.id,
            userId: integrationRecord.userId,
            entities: entities,
            config: integrationRecord.config,
            status: integrationRecord.status,
            version: integrationRecord.version,
            messages: integrationRecord.messages,
            modules
        });

        await integrationInstance.initialize();

        return integrationInstance
    }
}

module.exports = { GetIntegrationInstanceByDefinition }; 