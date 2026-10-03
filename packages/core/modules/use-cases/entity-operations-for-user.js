const Boom = require('@hapi/boom');

/**
 * Management API v2 entity operations. Each one starts from
 * GetEntityModuleForUser, so ownership is checked the same way everywhere
 * (missing or foreign entity = 404).
 */

/** The caller's connected entities. */
class ListEntitiesForUser {
    constructor({ moduleRepository }) {
        this.moduleRepository = moduleRepository;
    }

    /** @param {Object} user - authenticated User */
    async execute(user) {
        const entities = await this.moduleRepository.findEntitiesByUserId(
            user.getId()
        );
        return Array.isArray(entities) ? entities : [];
    }
}

/** One entity the caller owns. */
class GetEntityForUser {
    constructor({ getEntityModuleForUser }) {
        this.getEntityModuleForUser = getEntityModuleForUser;
    }

    async execute(entityId, user) {
        return this.getEntityModuleForUser.loadOwnedEntity(entityId, user);
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
 * Deletes an entity the caller owns. Refuses with 409 while integrations
 * still use it, so an integration never points at a missing entity. The
 * credential is left alone (others may share it); delete it through
 * /api/v2/credentials.
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
