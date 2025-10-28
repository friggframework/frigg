// Removed Integration wrapper - using IntegrationBase directly
const {
    mapIntegrationClassToIntegrationDTO,
} = require('../utils/map-integration-dto');

/**
 * Use case for retrieving all integrations for a specific user.
 * @class GetIntegrationsForUser
 */
class GetIntegrationsForUser {
    /**
     * Creates a new GetIntegrationsForUser instance.
     * @param {Object} params - Configuration parameters.
     * @param {import('../repositories/integration-repository-interface').IntegrationRepositoryInterface} params.integrationRepository - Repository for integration data operations.
     * @param {Array<import('../integration').Integration>} params.integrationClasses - Array of available integration classes.
     * @param {import('../../modules/module-factory').ModuleFactory} params.moduleFactory - Service for module instantiation and management.
     * @param {import('../../modules/repositories/module-repository-interface').ModuleRepositoryInterface} params.moduleRepository - Repository for module and entity data operations.
     */
    constructor({
        integrationRepository,
        integrationClasses,
        moduleFactory,
        moduleRepository,
    }) {
        /**
         * @type {import('../repositories/integration-repository-interface').IntegrationRepositoryInterface}
         */
        this.integrationRepository = integrationRepository;
        this.integrationClasses = integrationClasses;
        this.moduleFactory = moduleFactory;
        this.moduleRepository = moduleRepository;
    }

    /**
     * Executes the retrieval of all integrations for a user.
     * @async
     * @param {string} userId - ID of the user whose integrations to retrieve.
     * @returns {Promise<Object[]>} Array of integration DTOs for the specified user.
     */
    async execute(userId) {
        const integrationRecords =
            await this.integrationRepository.findIntegrationsByUserId(userId);

        const integrations = [];

        for (const integrationRecord of integrationRecords) {
            const entities = await this.moduleRepository.findEntitiesByIds(
                integrationRecord.entitiesIds
            );

            const integrationClass = this.integrationClasses.find(
                (integrationClass) =>
                    integrationClass.Definition.name ===
                    integrationRecord.config.type
            );

            const modules = [];
            for (const entity of entities) {
                const moduleInstance =
                    await this.moduleFactory.getModuleInstance(
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
                modules,
            });

            integrations.push(
                mapIntegrationClassToIntegrationDTO(integrationInstance)
            );
        }

        return integrations;
    }
}

module.exports = { GetIntegrationsForUser };
