const { Module } = require('../module');
const { DEFAULT_SCOPE_POLICY } = require('../scope-policy');
const {
    findModuleDefinitionForEntity,
} = require('../utils/find-module-definition');

class RefreshEntityOptions {
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
            ? this.scopePolicy.canUseEntity(userIdOrUser, entity)
            : entity.userId?.toString() === userId?.toString();

        if (!isOwned) {
            throw new Error(
                `Entity ${entityId} does not belong to user ${userId}`
            );
        }

        const entityType = entity.moduleName;
        const moduleDefinition = findModuleDefinitionForEntity(
            this.moduleDefinitions,
            entity
        );

        if (!moduleDefinition) {
            throw new Error(
                `Module definition not found for entity type: ${entityType}`
            );
        }

        // Built for the entity's OWNER, not the caller: a caller may use an
        // organization's entity, and a token refresh during this call must
        // update the owner's credential, not create one under the caller.
        const module = new Module({
            userId: entity.userId ?? userId,
            entity,
            definition: moduleDefinition,
        });

        await module.refreshEntityOptions(options);
        return module.getEntityOptions();
    }
}

module.exports = { RefreshEntityOptions };
