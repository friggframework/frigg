const Boom = require('@hapi/boom');
const {
    describeRecord,
    visibilityClauses,
    matchesListFilters,
} = require('../scope-visibility');
const { DEFAULT_SCOPE_POLICY } = require('../scope-policy');
const { assertCanManage } = require('./manage-access');

/**
 * Management API v2 entity operations. Each one starts from
 * GetEntityModuleForUser, so ownership is checked the same way everywhere
 * (missing or foreign entity = 404).
 */

/**
 * The entities the caller may see in the active organization (ADR-056 §3.4,
 * §3.6): the organization's own, and the caller's individual ones by the
 * visibility rule. Each carries `tenancy` ({scope, owner, organizationId,
 * access}); the stored entity is otherwise untouched.
 */
class ListEntitiesForUser {
    constructor({ moduleRepository, scopePolicy }) {
        this.moduleRepository = moduleRepository;
        this.scopePolicy = scopePolicy || DEFAULT_SCOPE_POLICY;
    }

    /**
     * @param {Object} user - authenticated User
     * @param {{scope?: string, owner?: string}} [filters] - `?scope=` and `?owner=`
     */
    async execute(user, filters = {}) {
        const ctx = this.scopePolicy.accessContext(user);
        const entities = await this.moduleRepository.findEntitiesByOwnership(
            visibilityClauses(ctx, 'entity')
        );
        const listed = [];
        for (const entity of Array.isArray(entities) ? entities : []) {
            // The query is the filter; this is the same rule applied again,
            // so a repository that returns too much cannot widen the list.
            const tenancy = describeRecord(entity, ctx, 'entity');
            if (tenancy && matchesListFilters(tenancy, filters)) {
                listed.push({ ...entity, tenancy });
            }
        }
        return listed;
    }
}

/** One entity the caller may use, with its `tenancy`. */
class GetEntityForUser {
    constructor({ getEntityModuleForUser }) {
        this.getEntityModuleForUser = getEntityModuleForUser;
    }

    async execute(entityId, user) {
        const entity = await this.getEntityModuleForUser.loadOwnedEntity(
            entityId,
            user
        );
        return {
            ...entity,
            tenancy: this.getEntityModuleForUser.describe(entity, user),
        };
    }
}

/** Runs the module's testAuthRequest against the stored credential. */
class TestEntityAuthForUser {
    constructor({ getEntityModuleForUser }) {
        this.getEntityModuleForUser = getEntityModuleForUser;
    }

    /** @returns {Promise<boolean>} */
    async execute(entityId, user) {
        const { module } = await this.getEntityModuleForUser.execute(
            entityId,
            user
        );
        return Boolean(await module.testAuth());
    }
}

/** The module's entity options (e.g. objects a user can pick). */
class GetEntityOptionsForUser {
    constructor({ getEntityModuleForUser }) {
        this.getEntityModuleForUser = getEntityModuleForUser;
    }

    async execute(entityId, user) {
        const { module } = await this.getEntityModuleForUser.execute(
            entityId,
            user
        );
        return module.getEntityOptions();
    }
}

/** Refreshes the module's entity options with caller input, then returns them. */
class RefreshEntityOptionsForUser {
    constructor({ getEntityModuleForUser }) {
        this.getEntityModuleForUser = getEntityModuleForUser;
    }

    async execute(entityId, user, options = {}) {
        const { module } = await this.getEntityModuleForUser.execute(
            entityId,
            user
        );
        return module.refreshEntityOptions(options);
    }
}

/**
 * Deletes an entity the caller may manage (the owner; for an organization
 * entity, an organization admin). Refuses with 409 while integrations still
 * use it, so an integration never points at a missing entity. The credential
 * is left alone (others may share it); delete it through /api/v2/credentials.
 */
class DeleteEntityForUser {
    constructor({ getEntityModuleForUser, moduleRepository, integrationRepository }) {
        this.getEntityModuleForUser = getEntityModuleForUser;
        this.moduleRepository = moduleRepository;
        this.integrationRepository = integrationRepository;
    }

    async execute(entityId, user) {
        const entity = await this.getEntityModuleForUser.loadOwnedEntity(
            entityId,
            user
        );
        assertCanManage(
            this.getEntityModuleForUser.describe(entity, user)?.access,
            `entity ${entity.id}`
        );
        const integrations =
            (await this.integrationRepository.findIntegrationsByEntityId(
                entity.id
            )) || [];
        if (integrations.length > 0) {
            throw Boom.conflict(
                `Entity ${entity.id} is used by ${integrations.length} integration(s); delete them first`,
                {
                    code: 'ENTITY_IN_USE',
                    details: {
                        integrationIds: integrations.map((i) => String(i.id)),
                    },
                }
            );
        }
        await this.moduleRepository.deleteEntity(entity.id);
    }
}

module.exports = {
    ListEntitiesForUser,
    GetEntityForUser,
    TestEntityAuthForUser,
    GetEntityOptionsForUser,
    RefreshEntityOptionsForUser,
    DeleteEntityForUser,
};
