const Boom = require('@hapi/boom');
const { describeRecord } = require('../../modules/scope-visibility');
const { DEFAULT_SCOPE_POLICY } = require('../../modules/scope-policy');
const { assertCanManage } = require('../../modules/use-cases/manage-access');
const { isIntegrationNotFound } = require('../repositories/integration-not-found');

/**
 * Management API v2 integration operations. They put an access check
 * (missing or unavailable integration = 404) in front of the existing
 * integration use cases, and pass the record's owner id on. Access follows
 * the owner and the organization the integration was created in (ADR-056
 * §3.6), not the owner alone.
 */

const notFound = (integrationId) =>
    Boom.notFound(`Integration ${integrationId} not found`, {
        code: 'INTEGRATION_NOT_FOUND',
    });

/**
 * The integration record, or 404 when it is missing or the caller may not
 * use it: not theirs or their active organization's, or created in another
 * organization.
 */
class GetOwnedIntegrationRecord {
    constructor({ integrationRepository, scopePolicy }) {
        this.integrationRepository = integrationRepository;
        this.scopePolicy = scopePolicy || DEFAULT_SCOPE_POLICY;
    }

    /** `{ scope, owner, organizationId, access }` of a record to this caller, or null. */
    describe(record, user) {
        return describeRecord(record, this.scopePolicy.accessContext(user), 'integration');
    }

    /**
     * @param {string} integrationId
     * @param {Object} user - authenticated User
     * @param {{manage?: boolean}} [options] - `manage: true` for changing or
     *   deleting: a person may use an organization's integration but only an
     *   admin may change it (403 ORG_ADMIN_REQUIRED)
     */
    async execute(integrationId, user, { manage = false } = {}) {
        let record = null;
        try {
            record = await this.integrationRepository.findIntegrationById(
                integrationId
            );
        } catch (error) {
            if (
                /Invalid ID|ObjectId|Malformed/i.test(error?.message || '') ||
                isIntegrationNotFound(error)
            ) {
                throw notFound(integrationId);
            }
            throw error;
        }
        const tenancy = record && this.describe(record, user);
        if (!tenancy) throw notFound(integrationId);
        if (manage) assertCanManage(tenancy.access, `integration ${integrationId}`);
        return record;
    }
}

/**
 * Creates (or reuses) an integration between entities the caller may use.
 * The entities' access, the binding scopes and the integration type are
 * checked before anything is written, and the integration is owned and
 * paired with an organization by `resolveIntegrationOwnership` (§3, §3.6).
 */
class CreateIntegrationForUser {
    constructor({ createIntegration, resolveIntegrationOwnership, integrationClasses }) {
        this.createIntegration = createIntegration;
        this.resolveIntegrationOwnership = resolveIntegrationOwnership;
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
        const { ownerId, organizationId, adoptUnscoped } =
            await this.resolveIntegrationOwnership.execute({
                entityIds: entities,
                config,
                user,
            });
        return this.createIntegration.execute(
            entities.map(String),
            ownerId,
            config,
            { organizationId, adoptUnscoped }
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
            user,
            { manage: true }
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
            user,
            { manage: true }
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
