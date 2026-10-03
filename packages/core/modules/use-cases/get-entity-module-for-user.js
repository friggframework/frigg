const Boom = require('@hapi/boom');

/**
 * True when `user` may act on records owned by `ownerId`. Uses the User
 * domain object's rule (individual or organisation user model) when present.
 * @param {Object} user - authenticated User (or a plain { getId } double)
 * @param {string|number} ownerId
 */
function userOwns(user, ownerId) {
    if (ownerId === undefined || ownerId === null || !user) return false;
    if (typeof user.ownsUserId === 'function') return user.ownsUserId(ownerId);
    return String(user.getId()) === String(ownerId);
}

const defaultCreateModule = (params) => {
    const { Module } = require('../module');
    return new Module(params);
};

/**
 * Loads an entity the caller owns and builds its Module (API client
 * hydrated from the persisted entity and credential). Management API v2.
 *
 * A missing entity and one owned by someone else are the same 404, so ids
 * cannot be probed (ADR-052 §3).
 */
class GetEntityModuleForUser {
    /**
     * @param {Object} params
     * @param {import('../repositories/module-repository-interface').ModuleRepositoryInterface} params.moduleRepository
     * @param {Array<Object>} params.moduleDefinitions
     * @param {Function} [params.createModule] - builds a Module; injectable for tests.
     */
    constructor({ moduleRepository, moduleDefinitions, createModule }) {
        this.moduleRepository = moduleRepository;
        this.moduleDefinitions = moduleDefinitions || [];
        this.createModule = createModule || defaultCreateModule;
    }

    /**
     * @param {string} entityId
     * @param {Object} user - authenticated User
     * @returns {Promise<{ entity: Object, definition: Object, module: Object }>}
     */
    async execute(entityId, user) {
        const entity = await this.loadOwnedEntity(entityId, user);
        const definition = this.moduleDefinitions.find(
            (def) => def.moduleName === entity.moduleName
        );
        if (!definition) {
            throw Boom.notFound(
                `Entity type ${entity.moduleName} is not configured in this app`,
                { code: 'ENTITY_TYPE_NOT_FOUND' }
            );
        }
        const module = this.createModule({
            userId: entity.userId,
            entity,
            definition,
        });
        return { entity, definition, module };
    }

    /** The entity record, or a 404 when it is missing or not the caller's. */
    async loadOwnedEntity(entityId, user) {
        let entity = null;
        try {
            entity = await this.moduleRepository.findEntityById(entityId);
        } catch (error) {
            // A malformed id (e.g. not an integer on Postgres) is "not found".
            if (/Invalid ID|ObjectId|Malformed/i.test(error?.message || '')) {
                entity = null;
            } else {
                throw error;
            }
        }
        if (!entity || !userOwns(user, entity.userId)) {
            throw Boom.notFound(`Entity ${entityId} not found`, {
                code: 'ENTITY_NOT_FOUND',
            });
        }
        return entity;
    }
}

module.exports = { GetEntityModuleForUser, userOwns };
