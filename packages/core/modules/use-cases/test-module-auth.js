const { Module } = require('../module');

class TestModuleAuth {
    /**
     * @param {Object} params - Configuration parameters.
     * @param {import('../repositories/module-repository-interface').ModuleRepositoryInterface} params.moduleRepository - Repository for module data operations.
     * @param {Array<Object>} params.moduleDefinitions - Array of module definitions.
     */
    constructor({ moduleRepository, moduleDefinitions }) {
        this.moduleRepository = moduleRepository;
        this.moduleDefinitions = moduleDefinitions;
    }

    async execute(entityId, userId) {
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

        const testAuthResponse = await module.testAuth();

        return testAuthResponse;
    }
}

module.exports = { TestModuleAuth };
