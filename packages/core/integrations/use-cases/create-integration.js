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
     * @async
     * @param {string[]} entities - Array of entity IDs to associate with the integration.
     * @param {string} userId - ID of the user creating the integration.
     * @param {Object} config - Configuration object for the integration.
     * @param {string} config.type - Type of integration to create.
     * @returns {Promise<Object>} The created integration DTO.
     * @throws {Error} When integration class is not found for the specified type.
     */
    async execute(entities, userId, config) {
        // Find integration class first to check for global entities
        const integrationClass = this.integrationClasses.find(
            (integrationClass) =>
                integrationClass.Definition.name === config.type
        );

        if (!integrationClass) {
            throw new Error(
                `No integration class found for type: ${config.type}`
            );
        }

        // Auto-include global entities if defined in integration
        const allEntities = [...entities];

        if (integrationClass.Definition?.entities) {
            // Check for global entities that need to be auto-included
            for (const [entityKey, entityConfig] of Object.entries(integrationClass.Definition.entities)) {
                if (entityConfig.global === true) {
                    // Find the global entity of this type using module repository
                    const globalEntity = await this.moduleFactory.moduleRepository.findEntityBy({
                        type: entityConfig.type,
                        isGlobal: true,
                        status: 'connected'
                    });

                    if (globalEntity) {
                        console.log(`✅ Auto-including global entity: ${entityConfig.type} (${globalEntity._id})`);
                        allEntities.push(globalEntity._id.toString());
                    } else if (entityConfig.required !== false) {
                        throw new Error(
                            `Required global entity "${entityConfig.type}" not found. Admin must configure this entity first.`
                        );
                    }
                }
            }
        }

        const integrationRecord =
            await this.integrationRepository.createIntegration(
                allEntities,
                userId,
                config
            );

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
        await integrationInstance.send('ON_CREATE', {
            integrationId: integrationRecord.id,
        });

        return mapIntegrationClassToIntegrationDTO(integrationInstance);
    }
}

module.exports = { CreateIntegration };
