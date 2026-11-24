// todo: remove this file

const { Module } = require('./module');

/**
 * Acts as a factory for fully-hydrated domain Module instances.
 * Provides methods to retrieve and construct Module objects with their associated
 * entity and definition.
 */
class ModuleFactory {
    /**
     * @param {Object} params - Configuration parameters.
     * @param {import('./repositories/module-repository-interface').ModuleRepositoryInterface} params.moduleRepository - Repository for module data operations.
     * @param {Array<Object>} params.moduleDefinitions - Array of module definitions.
     */
    constructor({ moduleRepository, moduleDefinitions }) {
        this.moduleRepository = moduleRepository;
        this.moduleDefinitions = moduleDefinitions;
    }

    async getModuleInstance(entityId, userId) {
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

        const moduleName = entity.moduleName;
        const moduleDefinition = this.moduleDefinitions.find((def) => {
            return moduleName === def.moduleName;
        });

        if (!moduleDefinition) {
            throw new Error(
                `Module definition not found for module: ${moduleName}`
            );
        }

        return new Module({
            userId,
            entity,
            definition: moduleDefinition,
        });
    }
}

module.exports = { ModuleFactory };
