const {
    mapIntegrationClassToIntegrationDTO,
} = require('../utils/map-integration-dto');

/**
 * Use case for creating a new integration.
 *
 * Supports entity scope resolution via Definition.entities[key].scope:
 * - 'global': Auto-resolves from global entities (existing behavior)
 * - 'organization': Auto-resolves from organization user's entities
 * - 'individual': Auto-resolves from individual user's entities (default)
 *
 * @class CreateIntegration
 *
 * @example
 * // Integration Definition with mixed entity scopes
 * static Definition = {
 *     name: 'salesforce-to-slack',
 *     entities: {
 *         salesforce: {
 *             type: 'salesforce-api',
 *             scope: 'organization',  // Auto-resolve from org
 *             required: true
 *         },
 *         slack: {
 *             type: 'slack-api',
 *             scope: 'individual',    // Auto-resolve from individual
 *             required: true
 *         },
 *         twilio: {
 *             type: 'twilio-api',
 *             scope: 'global',        // Auto-resolve from global (same as global: true)
 *             required: true
 *         }
 *     }
 * };
 */
class CreateIntegration {
    constructor({ integrationRepository, integrationClasses, moduleFactory }) {
        this.integrationRepository = integrationRepository;
        this.integrationClasses = integrationClasses;
        this.moduleFactory = moduleFactory;
    }

    /**
     * Execute the use case.
     *
     * @param {string[]} entities - Array of entity IDs explicitly provided.
     * @param {string|Object} userOrUserId - User ID or User object.
     *   User object required for scope-based entity resolution.
     * @param {Object} config - Integration configuration including type.
     * @returns {Promise<Object>} Created integration DTO.
     */
    async execute(entities, userOrUserId, config) {
        const integrationClass = this.integrationClasses.find(
            (integrationClass) =>
                integrationClass.Definition.name === config.type
        );

        if (!integrationClass) {
            throw new Error(
                `No integration class found for type: ${config.type}`
            );
        }

        // Support both userId string and User object
        const isUserObject =
            typeof userOrUserId === 'object' && userOrUserId?.getId;
        const userId = isUserObject ? userOrUserId.getId() : userOrUserId;
        const user = isUserObject ? userOrUserId : null;

        const allEntities = [...entities];

        if (integrationClass.Definition?.entities) {
            for (const [entityKey, entityConfig] of Object.entries(
                integrationClass.Definition.entities
            )) {
                // Determine scope: 'global' flag takes precedence for backwards compat
                const scope = entityConfig.global === true
                    ? 'global'
                    : entityConfig.scope || 'individual';

                const resolvedEntity = await this._resolveEntityByScope(
                    entityConfig,
                    scope,
                    user,
                    userId
                );

                if (resolvedEntity) {
                    // Avoid duplicates if entity was already provided
                    const entityIdStr = resolvedEntity.id.toString();
                    if (!allEntities.includes(entityIdStr)) {
                        allEntities.push(entityIdStr);
                    }
                } else if (entityConfig.required !== false && scope !== 'individual') {
                    // Only throw for global/organization scope if required
                    // Individual scope entities are expected to be provided explicitly
                    throw new Error(
                        `Required ${scope} entity "${entityConfig.type}" not found or invalid.`
                    );
                }
            }
        }

        const integrationRecord =
            await this.integrationRepository.createIntegration(
                allEntities,
                userId,
                config
            );

        const modules = [];
        for (const entityId of integrationRecord.entitiesIds) {
            const moduleInstance = await this.moduleFactory.getModuleInstance(
                entityId,
                integrationRecord.userId
            );
            modules.push(moduleInstance);
        }

        const integrationInstance = new integrationClass({
            id: integrationRecord.id,
            userId: integrationRecord.userId,
            entities: integrationRecord.entitiesIds,
            config: integrationRecord.config,
            status: integrationRecord.status,
            version: integrationRecord.version,
            messages: integrationRecord.messages,
            modules,
        });

        await integrationInstance.initialize();
        await integrationInstance.send('ON_CREATE', {
            integrationId: integrationRecord.id,
        });

        return mapIntegrationClassToIntegrationDTO(integrationInstance);
    }

    /**
     * Resolve an entity based on its scope.
     * @private
     * @param {Object} entityConfig - Entity configuration from Definition.
     * @param {string} scope - Resolved scope ('global' | 'organization' | 'individual').
     * @param {Object|null} user - User object (null if not provided).
     * @param {string} userId - User ID.
     * @returns {Promise<Object|null>} Resolved entity or null.
     */
    async _resolveEntityByScope(entityConfig, scope, user, userId) {
        const { moduleRepository } = this.moduleFactory;

        switch (scope) {
            case 'global': {
                const entity = await moduleRepository.findEntity({
                    moduleName: entityConfig.type,
                    isGlobal: true,
                });
                if (entity?.credential?.authIsValid) {
                    return entity;
                }
                return null;
            }

            case 'organization': {
                if (!user?.organizationUser?.id) {
                    throw new Error(
                        `Cannot resolve organization-scoped entity "${entityConfig.type}": user has no linked organization.`
                    );
                }
                const entities = await moduleRepository.findEntitiesBy({
                    userId: user.organizationUser.id,
                    moduleName: entityConfig.type,
                });
                // Return first valid entity
                const validEntity = entities.find(
                    (e) => e.credential?.authIsValid !== false
                );
                return validEntity || null;
            }

            case 'individual':
            default:
                // Individual scope entities are typically provided explicitly
                // But we can try to auto-resolve if User object is available
                if (user?.individualUser?.id) {
                    const entities = await moduleRepository.findEntitiesBy({
                        userId: user.individualUser.id,
                        moduleName: entityConfig.type,
                    });
                    const validEntity = entities.find(
                        (e) => e.credential?.authIsValid !== false
                    );
                    return validEntity || null;
                }
                return null;
        }
    }
}

module.exports = { CreateIntegration };
