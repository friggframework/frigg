// Removed Integration wrapper - using IntegrationBase directly
const {
    mapIntegrationClassToIntegrationDTO,
} = require('../utils/map-integration-dto');

/**
 * Use case for creating a new integration instance.
 * @class CreateIntegration
 */
class CreateIntegration {
    /**
     * Creates a new CreateIntegration instance.
     * @param {Object} params - Configuration parameters.
     * @param {import('../repositories/integration-repository-interface').IntegrationRepositoryInterface} params.integrationRepository - Repository for integration data operations.
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
     *
     * If an integration for this user with the same type and identical entity
     * set already exists, the existing record is reused instead of being
     * duplicated. In that case the integration is loaded, `testAuth` is run so
     * that stale credentials surface as an `ERROR` status / message, and the
     * existing DTO is returned. Entity identity already encodes the external
     * account because `ProcessAuthorizationCallback` dedupes entities by
     * (userId, moduleName, externalId).
     *
     * @async
     * @param {string[]} entities - Array of entity IDs to associate with the integration.
     * @param {string} userId - ID of the user creating the integration.
     * @param {Object} config - Configuration object for the integration.
     * @param {string} config.type - Type of integration to create.
     * @returns {Promise<Object>} The created or reused integration DTO.
     * @throws {Error} When integration class is not found for the specified type.
     */
    async execute(entities, userId, config) {
        const existing =
            await this.integrationRepository.findIntegrationByUserIdTypeAndEntities(
                userId,
                config?.type,
                entities
            );

        if (existing) {
            const instance = await this._buildInstance(existing);
            await instance.testAuth();
            return mapIntegrationClassToIntegrationDTO(instance);
        }

        const integrationRecord =
            await this.integrationRepository.createIntegration(
                entities,
                userId,
                config
            );

        const integrationInstance = await this._buildInstance(integrationRecord);

        await integrationInstance.send('ON_CREATE', {
            integrationId: integrationRecord.id,
        });

        return mapIntegrationClassToIntegrationDTO(integrationInstance);
    }

    /**
     * Build and initialize an integration instance from a persisted record.
     * @private
     */
    async _buildInstance(integrationRecord) {
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
            modules,
        });

        await integrationInstance.initialize();
        return integrationInstance;
    }
}

module.exports = { CreateIntegration };
