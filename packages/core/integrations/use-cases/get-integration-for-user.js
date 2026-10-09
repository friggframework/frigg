// Removed Integration wrapper - using IntegrationBase directly
const { mapIntegrationClassToIntegrationDTO } = require('../utils/map-integration-dto');
const Boom = require('@hapi/boom');

/**
 * Use case for retrieving a single integration for a specific user.
 * @class GetIntegrationForUser
 */
class GetIntegrationForUser {
    /**
     * Creates a new GetIntegrationForUser instance.
     * @param {Object} params - Configuration parameters.
     * @param {import('../integration-repository-interface').IntegrationRepositoryInterface} params.integrationRepository - Repository for integration data operations.
     * @param {Array<import('../integration').Integration>} params.integrationClasses - Array of available integration classes.
     * @param {import('../../modules/module-factory').ModuleFactory} params.moduleFactory - Service for module instantiation and management.
     * @param {import('../../modules/module-repository-interface').ModuleRepositoryInterface} params.moduleRepository - Repository for module and entity data operations.
     */
    constructor({ integrationRepository, integrationClasses, moduleFactory, moduleRepository }) {

        /**
         * @type {import('../integration-repository-interface').IntegrationRepositoryInterface}
         */
        this.integrationRepository = integrationRepository;
        this.integrationClasses = integrationClasses;
        this.moduleFactory = moduleFactory;
        this.moduleRepository = moduleRepository;
    }

    /**
     * Executes the retrieval of a single integration for a user.
     * @async
     * @param {string} integrationId - ID of the integration to retrieve.
     * @param {string} userId - ID of the user requesting the integration.
     * @returns {Promise<Object>} The integration DTO for the specified user.
     * @throws {Boom.notFound} When integration with the specified ID does not exist.
     * @throws {Boom.forbidden} When user does not have access to the integration.
     */
    async execute(integrationId, userId) {
        const integrationRecord = await this.integrationRepository.findIntegrationById(integrationId);
        const entities = await this.moduleRepository.findEntitiesByIds(integrationRecord.entitiesIds);

        if (!integrationRecord) {
            throw Boom.notFound(`Integration with id of ${integrationId} does not exist`);
        }

        if (integrationRecord.userId.toString() !== userId.toString()) {
            throw Boom.forbidden('User does not have access to this integration');
        }

        const integrationClass = this.integrationClasses.find(
            (integrationClass) => integrationClass.Definition.name === integrationRecord.config.type
        );

        const modules = [];
        for (const entity of entities) {
            const moduleInstance = await this.moduleFactory.getModuleInstance(
                entity._id,
                integrationRecord.userId
            );
            modules.push(moduleInstance);
        }

        const integrationInstance = new integrationClass({
            id: integrationRecord._id,
            userId: integrationRecord.userId,
            entities: entities,
            config: integrationRecord.config,
            status: integrationRecord.status,
            version: integrationRecord.version,
            messages: integrationRecord.messages,
            modules
        });

        return mapIntegrationClassToIntegrationDTO(integrationInstance);
    }
}

module.exports = { GetIntegrationForUser }; 