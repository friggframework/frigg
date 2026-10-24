const { Module } = require('../module');
const { DEFAULT_SCOPE_POLICY } = require('../scope-policy');
const {
    findModuleDefinitionForEntity,
} = require('../utils/find-module-definition');
const { toPublicEntity } = require('../utils/public-entity');

class GetModule {
    constructor({ moduleRepository, moduleDefinitions, scopePolicy }) {
        this.moduleRepository = moduleRepository;
        this.moduleDefinitions = moduleDefinitions;
        // Who may load an entity follows its scope (ADR-056 §3.6).
        this.scopePolicy = scopePolicy || DEFAULT_SCOPE_POLICY;
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

        // The credential (tokens, API keys) never leaves the server: the
        // response names it and says whether it still works.
        const { credentialId, authIsValid } = toPublicEntity({
            ...module.entity,
            credential: module.credential,
        });
        return {
            id: module.entity.id,
            name: module.entity.name,
            moduleName: module.entity.moduleName,
            credentialId,
            authIsValid,
            externalId: module.entity.externalId,
            userId: toPublicEntity(module.entity).userId,
        };
    }
}

module.exports = { GetModule };