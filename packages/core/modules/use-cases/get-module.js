const { Module } = require('../module');

class GetModule {
    constructor({ moduleRepository, moduleDefinitions }) {
        this.moduleRepository = moduleRepository;
        this.moduleDefinitions = moduleDefinitions;
    }

    /**
     * Get module instance for an entity
     *
     * @param {string|number} entityId - Entity ID to retrieve
     * @param {string|number|import('../../user/user').User} userIdOrUser - User ID or User object for validation
     * @returns {Promise<Object>} Module details
     */
    async execute(entityId, userIdOrUser) {
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
        // If User object provided, use ownsUserId to check linked users
        // Otherwise fall back to simple equality check
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
            const modelName = Module.getEntityModelFromDefinition(def).modelName;
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

        // todo: this properties should be methods in the Module class
        return {
            id: module.entity.id,
            name: module.entity.name,
            moduleName: module.entity.moduleName,
            credential: module.credential,
            externalId: module.entity.externalId,
            userId: module.entity.user.toString(),
        }
    }
}

module.exports = { GetModule };