const { Module } = require('../module');
const {
    findModuleDefinitionForEntity,
} = require('../utils/find-module-definition');

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
        const moduleDefinition = findModuleDefinitionForEntity(
            this.moduleDefinitions,
            entity
        );

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

        // The credential itself (tokens, API keys) never leaves the server:
        // the response names it and says whether it still works, as the v2
        // entity DTO does.
        const credential = module.credential;
        const credentialId =
            credential && typeof credential === 'object'
                ? credential.id
                : credential;
        const ownerId = module.entity.userId ?? module.entity.user;
        return {
            id: module.entity.id,
            name: module.entity.name,
            moduleName: module.entity.moduleName,
            credentialId:
                credentialId === undefined || credentialId === null
                    ? null
                    : String(credentialId),
            authIsValid:
                typeof credential?.authIsValid === 'boolean'
                    ? credential.authIsValid
                    : null,
            externalId: module.entity.externalId,
            userId:
                ownerId === undefined || ownerId === null
                    ? null
                    : String(ownerId),
        };
    }
}

module.exports = { GetModule };