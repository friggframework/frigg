const { Module } = require('../module');
const { mapModuleClassToModuleDTO } = require('../utils/map-module-dto');

/**
 * Valid scope values for entity queries.
 * @typedef {'individual' | 'organization' | 'global' | 'all'} EntityScope
 */

/**
 * Use case for retrieving entities for a user.
 *
 * Supports scoped queries to find entities owned by:
 * - 'individual': The user's individual account
 * - 'organization': The user's linked organization
 * - 'global': Global entities (admin-managed, shared across all users)
 * - 'all': All accessible entities (individual + organization + global)
 *
 * @class GetEntitiesForUser
 *
 * @example
 * // Get only organization-owned entities
 * const orgEntities = await getEntitiesForUser.execute(user, 'organization');
 *
 * // Get all accessible entities (default behavior)
 * const allEntities = await getEntitiesForUser.execute(userId);
 */
class GetEntitiesForUser {
    constructor({ moduleRepository, moduleDefinitions }) {
        this.moduleRepository = moduleRepository;

        this.definitionMap = new Map();
        for (const definition of moduleDefinitions) {
            this.definitionMap.set(definition.moduleName, definition);
        }
    }

    /**
     * Execute the use case.
     *
     * @param {string|Object} userOrUserId - User ID (string) or User object.
     *   When User object is provided, scope filtering by organization is available.
     * @param {EntityScope} [scope='all'] - Entity scope to query.
     *   Only effective when userOrUserId is a User object.
     * @returns {Promise<Object[]>} Array of entity DTOs.
     */
    async execute(userOrUserId, scope = 'all') {
        // Support both userId string and User object for backwards compatibility
        const isUserObject =
            typeof userOrUserId === 'object' && userOrUserId?.getId;
        const userId = isUserObject ? userOrUserId.getId() : userOrUserId;

        let entities;

        if (isUserObject && scope !== 'all') {
            entities = await this._findEntitiesByScope(userOrUserId, scope);
        } else if (isUserObject) {
            // 'all' scope with User object - get individual, organization, and global
            entities = await this._findAllAccessibleEntities(userOrUserId);
        } else {
            // Legacy: just userId string, get entities for that user
            entities = await this.moduleRepository.findEntitiesByUserId(userId);
        }

        return entities.map((entity) => {
            const definition = this.definitionMap.get(entity.moduleName);

            const moduleInstance = new Module({
                userId,
                definition: definition,
                entity: entity,
            });
            return mapModuleClassToModuleDTO(moduleInstance);
        });
    }

    /**
     * Find entities by specific scope.
     * @private
     */
    async _findEntitiesByScope(user, scope) {
        switch (scope) {
            case 'global':
                return this.moduleRepository.findEntitiesBy({ isGlobal: true });

            case 'organization': {
                const orgId = user.organizationUser?.id;
                if (!orgId) {
                    return [];
                }
                return this.moduleRepository.findEntitiesByUserId(orgId);
            }

            case 'individual': {
                const individualId = user.individualUser?.id;
                if (!individualId) {
                    return [];
                }
                return this.moduleRepository.findEntitiesByUserId(individualId);
            }

            default:
                return this.moduleRepository.findEntitiesByUserId(user.getId());
        }
    }

    /**
     * Find all entities accessible to a user (individual + organization + global).
     * @private
     */
    async _findAllAccessibleEntities(user) {
        const queries = [];

        // Individual user's entities
        if (user.individualUser?.id) {
            queries.push(
                this.moduleRepository.findEntitiesByUserId(user.individualUser.id)
            );
        }

        // Organization user's entities (if linked)
        if (user.organizationUser?.id) {
            queries.push(
                this.moduleRepository.findEntitiesByUserId(user.organizationUser.id)
            );
        }

        // Global entities
        queries.push(this.moduleRepository.findEntitiesBy({ isGlobal: true }));

        const results = await Promise.all(queries);

        // Flatten and deduplicate by entity ID
        const entityMap = new Map();
        for (const entityList of results) {
            for (const entity of entityList) {
                if (!entityMap.has(entity.id)) {
                    entityMap.set(entity.id, entity);
                }
            }
        }

        return Array.from(entityMap.values());
    }
}

module.exports = { GetEntitiesForUser };
