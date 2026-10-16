const Boom = require('@hapi/boom');
const { describeRecord } = require('../scope-visibility');
const { DEFAULT_SCOPE_POLICY } = require('../scope-policy');
const { isEntityNotFound } = require('../repositories/entity-not-found');

/**
 * True when `user` may act on records owned by `ownerId`. Uses the User
 * domain object's rule (individual or organisation user model) when present.
 * This is the owner-only rule: it ignores the organization a record belongs
 * to, so it no longer decides access to an entity or an integration
 * (modules/scope-visibility.js does). Credentials still use it.
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
     * @param {Object} [params.scopePolicy] - from createScopePolicy; with none the
     *   app configures nothing (ADR-056 §3.1).
     */
    constructor({ moduleRepository, moduleDefinitions, createModule, scopePolicy }) {
        this.scopePolicy = scopePolicy || DEFAULT_SCOPE_POLICY;
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

    /**
     * The entity record, or a 404 when it is missing or the caller may not use
     * it: not theirs, or paired with another organization (ADR-056 §3.6). A
     * `global` entity is never the tenant's to load.
     */
    async loadOwnedEntity(entityId, user) {
        let entity = null;
        try {
            entity = await this.moduleRepository.findEntityById(entityId);
        } catch (error) {
            // Every adapter throws for a missing row, and a malformed id (e.g.
            // not an integer on Postgres) is "not found" too. Both must be the
            // 404 another tenant's entity gets, or the status says which ids
            // exist. Anything else is a real failure.
            if (
                isEntityNotFound(error) ||
                /Invalid ID|ObjectId|Malformed/i.test(error?.message || '')
            ) {
                entity = null;
            } else {
                throw error;
            }
        }
        if (!entity || !this.describe(entity, user)) {
            throw Boom.notFound(`Entity ${entityId} not found`, {
                code: 'ENTITY_NOT_FOUND',
            });
        }
        return entity;
    }

    /**
     * `{ scope, owner, organizationId, access }` of an entity to this caller,
     * or null when they may not see it (§3.4).
     */
    describe(entity, user) {
        return describeRecord(entity, this.scopePolicy.accessContext(user), 'entity');
    }
}

module.exports = { GetEntityModuleForUser, userOwns };
