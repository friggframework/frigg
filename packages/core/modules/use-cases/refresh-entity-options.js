const { Module } = require('../module');

class RefreshEntityOptions {
    /**
     * @param {Object} params
     * @param {import('../repositories/module-repository-interface').ModuleRepositoryInterface} params.moduleRepository
     * @param {} params.moduleDefinitions
     */
    constructor({ moduleRepository, moduleDefinitions }) {
        this.moduleRepository = moduleRepository;
        this.moduleDefinitions = moduleDefinitions;
    }

    /**
     * Retrieve a Module instance for a given user and entity/module type.
     * @param {string} userId
     * @param {string} entityId
     */
    async execute(entityId, userId, options) {
        const entity = await this.moduleRepository.findEntityById(
            entityId,
            userId
        );

        if (!entity) {
            throw new Error(`Entity ${entityId} not found`);
        }

        if (entity.userId !== userId) {
            throw new Error(
                `Entity ${entityId} does not belong to user ${userId}`
            );
        }

        const entityType = entity.type;
        const moduleDefinition = this.moduleDefinitions.find((def) => {
            const modelName =
                Module.getEntityModelFromDefinition(def).modelName;
            return entityType === modelName;
        });

        if (!moduleDefinition) {
            throw new Error(
                `Module definition not found for entity type: ${entityType}`
            );
        }

        const module = new Module({
            userId,
            entity,
            definition: moduleDefinition,
        });

        await module.refreshEntityOptions(options);
        return module.getEntityOptions();
    }
}

module.exports = { RefreshEntityOptions };
