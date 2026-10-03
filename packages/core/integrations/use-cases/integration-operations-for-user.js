const Boom = require('@hapi/boom');
const { userOwns } = require('../../modules/use-cases/get-entity-module-for-user');

/**
 * Management API v2 integration operations. They put an ownership check
 * (missing or foreign integration = 404) in front of the existing
 * integration use cases, and pass the record's owner id on, so the
 * organisation user model works the same as for entities.
 */

const notFound = (integrationId) =>
    Boom.notFound(`Integration ${integrationId} not found`, {
        code: 'INTEGRATION_NOT_FOUND',
    });

/** The integration record, or 404 when it is missing or not the caller's. */
class GetOwnedIntegrationRecord {
    constructor({ integrationRepository }) {
        this.integrationRepository = integrationRepository;
    }

    async execute(integrationId, user) {
        let record = null;
        try {
            record = await this.integrationRepository.findIntegrationById(
                integrationId
            );
        } catch (error) {
            if (/Invalid ID|ObjectId|Malformed/i.test(error?.message || '')) {
                throw notFound(integrationId);
            }
            throw error;
        }
        if (!record || !userOwns(user, record.userId)) {
            throw notFound(integrationId);
        }
        return record;
    }
}

/**
 * Creates (or reuses) an integration between entities the caller owns.
 * Unlike v1, the entities' ownership and the integration type are checked
 * before anything is written.
 */
class CreateIntegrationForUser {
    constructor({ createIntegration, getEntityModuleForUser, integrationClasses }) {
        this.createIntegration = createIntegration;
        this.getEntityModuleForUser = getEntityModuleForUser;
        this.integrationClasses = integrationClasses || [];
    }

    async execute({ entities, config }, user) {
        if (!config || typeof config !== 'object' || typeof config.type !== 'string') {
            throw Boom.badRequest('config.type is required', {
                code: 'VALIDATION_ERROR',
                details: { field: 'config.type' },
            });
        }
        const known = this.integrationClasses.some(
            (IntegrationClass) => IntegrationClass.Definition?.name === config.type
        );
        if (!known) {
            throw Boom.badRequest(`Unknown integration type '${config.type}'`, {
                code: 'UNKNOWN_INTEGRATION_TYPE',
            });
        }
        if (
            !Array.isArray(entities) ||
            entities.some((id) => typeof id !== 'string' && typeof id !== 'number')
        ) {
            throw Boom.badRequest('entities must be an array of entity ids', {
                code: 'VALIDATION_ERROR',
                details: { field: 'entities' },
            });
        }
        for (const entityId of entities) {
            await this.getEntityModuleForUser.loadOwnedEntity(String(entityId), user);
        }
        return this.createIntegration.execute(
            entities.map(String),
            user.getId(),
            config
        );
    }
}

/** The hydrated integration instance (modules loaded) for an owned integration. */
class GetIntegrationInstanceForUser {
    constructor({ getOwnedIntegrationRecord, getIntegrationInstance }) {
        this.getOwnedIntegrationRecord = getOwnedIntegrationRecord;
        this.getIntegrationInstance = getIntegrationInstance;
    }

    async execute(integrationId, user) {
        const record = await this.getOwnedIntegrationRecord.execute(
            integrationId,
            user
        );
        return this.getIntegrationInstance.execute(record.id, record.userId);
    }
}

/** Replaces an owned integration's config. */
class UpdateIntegrationForUser {
    constructor({ getOwnedIntegrationRecord, updateIntegration }) {
        this.getOwnedIntegrationRecord = getOwnedIntegrationRecord;
        this.updateIntegration = updateIntegration;
    }

    async execute(integrationId, user, config) {
        if (!config || typeof config !== 'object' || Array.isArray(config)) {
            throw Boom.badRequest('config must be an object', {
                code: 'VALIDATION_ERROR',
                details: { field: 'config' },
            });
        }
        const record = await this.getOwnedIntegrationRecord.execute(
            integrationId,
            user
        );
        return this.updateIntegration.execute(record.id, record.userId, config);
    }
}

/** Deletes an owned integration (runs its onDelete hooks). */
class RemoveIntegrationForUser {
    constructor({ getOwnedIntegrationRecord, deleteIntegrationForUser }) {
        this.getOwnedIntegrationRecord = getOwnedIntegrationRecord;
        this.deleteIntegrationForUser = deleteIntegrationForUser;
    }

    async execute(integrationId, user) {
        const record = await this.getOwnedIntegrationRecord.execute(
            integrationId,
            user
        );
        await this.deleteIntegrationForUser.execute(record.id, record.userId);
    }
}

/**
 * Sends one of the framework's user-facing events (GET_CONFIG_OPTIONS,
 * GET_USER_ACTIONS, ...) to an owned integration. Handlers pass fixed event
 * names only; caller-chosen action ids go through RunIntegrationActionForUser.
 */
class SendIntegrationEventForUser {
    constructor({ getIntegrationInstanceForUser }) {
        this.getIntegrationInstanceForUser = getIntegrationInstanceForUser;
    }

    async execute(integrationId, user, event, payload) {
        const instance = await this.getIntegrationInstanceForUser.execute(
            integrationId,
            user
        );
        return instance.send(event, payload);
    }
}

/**
 * Runs a user action on an owned integration. Unlike v1, the action id must
 * be one the integration lists as a user action (static USER_ACTION events
 * or its dynamic user actions), so a caller cannot fire internal events such
 * as lifecycle hooks.
 */
class RunIntegrationActionForUser {
    constructor({ getIntegrationInstanceForUser }) {
        this.getIntegrationInstanceForUser = getIntegrationInstanceForUser;
    }

    async execute(integrationId, user, actionId, payload) {
        const instance = await this.getIntegrationInstanceForUser.execute(
            integrationId,
            user
        );
        const actions =
            typeof instance.loadUserActions === 'function'
                ? await instance.loadUserActions()
                : {};
        if (!actions || !Object.prototype.hasOwnProperty.call(actions, actionId)) {
            throw Boom.notFound(
                `Integration ${integrationId} has no user action '${actionId}'`,
                { code: 'ACTION_NOT_FOUND' }
            );
        }
        return instance.send(actionId, payload);
    }
}

/**
 * Runs the integration's auth test and reconciles its status. Returns the
 * errors recorded during the test.
 */
class TestIntegrationAuthForUser {
    constructor({ getIntegrationInstanceForUser }) {
        this.getIntegrationInstanceForUser = getIntegrationInstanceForUser;
    }

    /** @returns {Promise<{ ok: boolean, errors: Array<Object> }>} */
    async execute(integrationId, user) {
        const instance = await this.getIntegrationInstanceForUser.execute(
            integrationId,
            user
        );
        const start = Date.now();
        const authPassed = await instance.testAuth();
        await instance.reconcileAuthStatus(authPassed);
        const errors = (instance.record?.messages?.errors || []).filter(
            ({ timestamp }) => timestamp >= start
        );
        return { ok: Boolean(authPassed) && errors.length === 0, errors };
    }
}

module.exports = {
    GetOwnedIntegrationRecord,
    CreateIntegrationForUser,
    GetIntegrationInstanceForUser,
    UpdateIntegrationForUser,
    RemoveIntegrationForUser,
    SendIntegrationEventForUser,
    RunIntegrationActionForUser,
    TestIntegrationAuthForUser,
};
