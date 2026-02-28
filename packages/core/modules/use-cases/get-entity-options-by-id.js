const { Module } = require('../module');

class GetEntityOptionsById {
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
     * Retrieve entity options for a given entity
     *
     * @param {string|number} entityId - Entity ID to retrieve options for
     * @param {string|number|import('../../user/user').User} userIdOrUser - User ID or User object for validation
     * @returns {Promise<Object>} Entity options
     */
    async execute(entityId, userIdOrUser) {
        // Support both userId (backward compatible) and User object (new pattern)
        const userId =
            typeof userIdOrUser === 'object' && userIdOrUser?.getId
                ? userIdOrUser.getId()
                : userIdOrUser;

        const entity = await this.moduleRepository.findEntityById(
            entityId,
            userId
        );

        if (!entity) {
            throw new Error(`Entity ${entityId} not found`);
        }

        // Validate entity ownership
        const isOwned =
            typeof userIdOrUser === 'object' && userIdOrUser?.ownsUserId
                ? userIdOrUser.ownsUserId(entity.userId)
                : entity.userId?.toString() === userId?.toString();

        if (!isOwned) {
            throw new Error(
                `Entity ${entityId} does not belong to user ${userId}`
            );
        }

        const entityType = entity.moduleName;
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

        const entityOptions = await module.getEntityOptions();
        return entityOptions;
    }
}

module.exports = { GetEntityOptionsById };
