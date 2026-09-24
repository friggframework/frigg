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
     * Refresh entity options for a given entity
     *
     * @param {string|number} entityId - Entity ID to refresh
     * @param {string|number|import('../../user/user').User} userIdOrUser - User ID or User object for validation
     * @param {Object} options - Refresh options
     * @returns {Promise<Object>} Updated entity options
     */
    async execute(entityId, userIdOrUser, options) {
        // Support both userId (backward compatible) and User object (new pattern)
        const userId = typeof userIdOrUser === 'object' && userIdOrUser?.getId
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
        const isOwned = typeof userIdOrUser === 'object' && userIdOrUser?.ownsUserId
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

        await module.refreshEntityOptions(options);
        return module.getEntityOptions();
    }
}

module.exports = { RefreshEntityOptions };
