const { Module } = require('../module');
const { DEFAULT_SCOPE_POLICY } = require('../scope-policy');

class GetEntityOptionsById {
    /**
     * @param {Object} params
     * @param {import('../repositories/module-repository-interface').ModuleRepositoryInterface} params.moduleRepository
     * @param {} params.moduleDefinitions
     */
    constructor({ moduleRepository, moduleDefinitions, scopePolicy }) {
        this.moduleRepository = moduleRepository;
        this.moduleDefinitions = moduleDefinitions;
        // Who may load an entity follows its scope (ADR-056 §3.6).
        this.scopePolicy = scopePolicy || DEFAULT_SCOPE_POLICY;
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
            ? this.scopePolicy.canUseEntity(userIdOrUser, entity)
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

        // Built for the entity's OWNER, not the caller: a caller may use an
        // organization's entity, and a token refresh during this call must
        // update the owner's credential, not create one under the caller.
        const module = await Module.create({
            userId: entity.userId ?? userId,
            entity,
            definition: moduleDefinition,
        });

        const entityOptions = await module.getEntityOptions();
        return entityOptions;
    }
}

module.exports = { GetEntityOptionsById };
