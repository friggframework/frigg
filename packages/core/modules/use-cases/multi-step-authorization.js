const Boom = require('@hapi/boom');
const { FetchError } = require('../../errors/fetch-error');
const { getLogger } = require('../../logs');
const { AuthorizationSession } = require('../domain/authorization-session');
const { findDefinition, getAuthStepCount } = require('./entity-types');
const { describeRecord } = require('../scope-visibility');
const { DEFAULT_SCOPE_POLICY } = require('../scope-policy');

const log = getLogger('frigg.api.authorize');

const defaultCreateModule = (params) => {
    const { Module } = require('../module');
    return Module.create(params);
};

const isMultiStep = (definition) =>
    getAuthStepCount(definition) > 1 ||
    typeof definition.processAuthorizationStep === 'function';

const sessionNotFound = () =>
    Boom.notFound('Authorization session not found or expired', {
        code: 'AUTHORIZATION_SESSION_NOT_FOUND',
    });

/**
 * Maps a failure from the module or the provider to a client-facing error.
 * Boom errors pass through. A provider HTTP failure is a 502; a failed auth
 * test or a ClientSafeError is a 400. Anything else stays a 500.
 */
function toAuthorizationError(error, { passMessage = false } = {}) {
    if (error?.isBoom) return error;
    if (error instanceof FetchError) {
        return Boom.badGateway('The provider rejected the authorization request', {
            code: 'UPSTREAM_ERROR',
            expose: true,
            details: { upstreamStatus: error.statusCode ?? null },
        });
    }
    if (error?.isClientSafe || passMessage) {
        return Boom.badRequest(error?.message || 'Authorization failed', {
            code: 'AUTHORIZATION_FAILED',
        });
    }
    if (error?.message === 'Authorization failed') {
        return Boom.badRequest(
            'Authorization failed: the credentials did not pass the module auth test',
            { code: 'AUTHORIZATION_FAILED' }
        );
    }
    return error;
}

/**
 * Loads the session a caller continues, checking it belongs to them, to the
 * entity type and (for re-authorization) to the credential.
 */
async function loadSession(repository, sessionId, binding) {
    if (typeof sessionId !== 'string' || !sessionId) throw sessionNotFound();
    const session = await repository.findBySessionId(sessionId);
    if (!session || session.isExpired() || !session.belongsTo(binding)) {
        throw sessionNotFound();
    }
    if (session.completed) {
        throw Boom.conflict('Authorization session is already complete', {
            code: 'AUTHORIZATION_SESSION_COMPLETED',
        });
    }
    return session;
}

async function startSession(repository, binding, maxSteps) {
    // Expired sessions are removed opportunistically; PostgreSQL has no TTL.
    Promise.resolve()
        .then(() => repository.deleteExpired())
        .catch((error) =>
        log.warn('Expired authorization sessions were not removed', {
            eventName: `${log.name}.session_cleanup_failed`,
            error,
        })
    );
    return repository.create(AuthorizationSession.start({ ...binding, maxSteps }));
}

/**
 * GET /api/v2/authorize (and GET /api/v2/credentials/:id/reauthorize): what
 * the caller must submit next. A multi-step flow gets a session on step 1;
 * later steps need that sessionId and must be the session's current step.
 */
class GetAuthorizationStep {
    /**
     * @param {Object} params
     * @param {Array<Object>} params.moduleDefinitions
     * @param {import('./get-authorization-requirements').GetAuthorizationRequirements} params.getAuthorizationRequirements
     * @param {import('../repositories/authorization-session-repository-interface').AuthorizationSessionRepositoryInterface} params.authorizationSessionRepository
     */
    constructor({ moduleDefinitions, getAuthorizationRequirements, authorizationSessionRepository }) {
        this.moduleDefinitions = moduleDefinitions || [];
        this.getAuthorizationRequirements = getAuthorizationRequirements;
        this.sessions = authorizationSessionRepository;
    }

    async execute({ user, entityType, step = 1, sessionId, credentialId = null, state }) {
        const definition = findDefinition(this.moduleDefinitions, entityType);
        const userId = user.getId();
        const requirementsFor = (n) =>
            this.getAuthorizationRequirements.execute({ entityType, step: n, userId, state });

        if (!isMultiStep(definition)) return requirementsFor(step);

        const binding = { userId, entityType, credentialId };
        let session;
        if (sessionId) {
            session = await loadSession(this.sessions, sessionId, binding);
            if (step !== session.currentStep) {
                throw Boom.conflict(
                    `This session expects step ${session.currentStep}`,
                    { code: 'STEP_OUT_OF_ORDER', details: { expectedStep: session.currentStep } }
                );
            }
        } else {
            if (step !== 1) {
                throw Boom.badRequest('sessionId is required after step 1', {
                    code: 'SESSION_REQUIRED',
                });
            }
            session = await startSession(this.sessions, binding, getAuthStepCount(definition));
        }
        return { ...(await requirementsFor(step)), sessionId: session.sessionId };
    }
}

/**
 * POST /api/v2/authorize (and POST /api/v2/credentials/:id/reauthorize).
 *
 * Single-step modules complete at once through ProcessAuthorizationCallback
 * (the v1 authorize logic). Multi-step modules run
 * definition.processAuthorizationStep(api, step, data, stepData) per step;
 * when it reports `completed`, its `authData` goes through the same
 * callback. Returns either
 * `{ status: 'complete', entity, credential }` (domain records; the handler
 * masks them) or
 * `{ status: 'pending', step, totalSteps, sessionId, requirements, message? }`.
 */
class SubmitAuthorizationStep {
    constructor({
        moduleDefinitions,
        getAuthorizationRequirements,
        authorizationSessionRepository,
        authorizeEntityForUser,
        moduleRepository,
        credentialRepository,
        createModule,
        scopePolicy,
    }) {
        this.scopePolicy = scopePolicy || DEFAULT_SCOPE_POLICY;
        this.moduleDefinitions = moduleDefinitions || [];
        this.getAuthorizationRequirements = getAuthorizationRequirements;
        this.sessions = authorizationSessionRepository;
        this.authorizeEntityForUser = authorizeEntityForUser;
        this.moduleRepository = moduleRepository;
        this.credentialRepository = credentialRepository;
        this.createModule = createModule || defaultCreateModule;
    }

    /**
     * @param {Object} params
     * @param {string} [params.scope] - the scope the caller asks for, from the
     *   deciding level's allow list (ADR-056 §3.1). Never `global`.
     * @param {string} [params.fixedScope] - re-authorization keeps the scope the
     *   credential already has, whatever the config says now.
     */
    async execute({ user, entityType, data, step = 1, sessionId, credentialId = null, scope, fixedScope }) {
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
            throw Boom.badRequest('data must be an object', {
                code: 'VALIDATION_ERROR',
                details: { field: 'data' },
            });
        }
        const definition = findDefinition(this.moduleDefinitions, entityType);
        // `userId` binds a session to the caller and is what GET /authorize
        // computes too. The owner of the entity this creates is decided by
        // scope (§3.2), not by user.primary, and is `ownership.ownerId`.
        const userId = user.getId();
        const ownership = this.authorizeEntityForUser.resolveOwnership({
            user,
            entityType,
            scope,
            fixedScope,
        });

        if (!isMultiStep(definition)) {
            if (step !== 1) {
                throw Boom.badRequest(`${entityType} has a single authorization step`, {
                    code: 'INVALID_STEP',
                });
            }
            return this.complete({ ownership, user, entityType, params: data, credentialId });
        }

        const totalSteps = getAuthStepCount(definition);
        const binding = { userId, entityType, credentialId };
        let session;
        if (sessionId) {
            session = await loadSession(this.sessions, sessionId, binding);
            if (step === 1 && session.currentStep !== 1) {
                session.restart();
            } else if (step !== session.currentStep) {
                throw Boom.conflict(`This session expects step ${session.currentStep}`, {
                    code: 'STEP_OUT_OF_ORDER',
                    details: { expectedStep: session.currentStep },
                });
            }
        } else {
            if (step !== 1) {
                throw Boom.badRequest('sessionId is required after step 1', {
                    code: 'SESSION_REQUIRED',
                });
            }
            session = await startSession(this.sessions, binding, totalSteps);
        }

        if (typeof definition.processAuthorizationStep !== 'function') {
            throw Boom.badImplementation(
                `Module ${entityType} declares ${totalSteps} steps but no processAuthorizationStep`
            );
        }

        const module = await this.createModule({ userId: ownership.ownerId, definition });
        let result;
        try {
            result = await definition.processAuthorizationStep(
                module.api,
                step,
                data,
                session.stepData
            );
        } catch (error) {
            // processAuthorizationStep errors are written for the end user
            // (docs/MULTI_STEP_AUTH_MIGRATION_GUIDE.md), e.g. "Invalid code".
            throw toAuthorizationError(error, { passMessage: true });
        }

        if (result?.completed) {
            session.markComplete();
            await this.sessions.update(session);
            const outcome = await this.complete({
                ownership,
                user,
                entityType,
                params: result.authData || {},
                credentialId,
            });
            // The collected data is no longer needed once the credential exists.
            await Promise.resolve()
                .then(() => this.sessions.deleteBySessionId(session.sessionId))
                .catch(() => {});
            return outcome;
        }

        const nextStep = result?.nextStep ?? step + 1;
        try {
            session.advanceTo(nextStep, result?.stepData);
        } catch (error) {
            throw Boom.badImplementation(
                `Module ${entityType} returned an invalid next step: ${error.message}`
            );
        }
        await this.sessions.update(session);

        const requirements = await this.getAuthorizationRequirements.execute({
            entityType,
            step: nextStep,
            userId,
        });
        return {
            status: 'pending',
            step: nextStep,
            totalSteps,
            sessionId: session.sessionId,
            requirements,
            ...(result?.message && { message: String(result.message) }),
        };
    }

    async complete({ ownership, user, entityType, params, credentialId }) {
        let callback;
        try {
            ({ result: callback } = await this.authorizeEntityForUser.execute({
                user,
                entityType,
                data: params,
                ownership,
            }));
        } catch (error) {
            throw toAuthorizationError(error);
        }
        const [entity, credential] = await Promise.all([
            this.moduleRepository.findEntityById(callback.entity_id),
            this.credentialRepository.findCredentialById(callback.credential_id),
        ]);
        // What the new entity is to this caller (§3.4), so a client need not list again.
        const tenancy = entity
            ? describeRecord(entity, this.scopePolicy.accessContext(user), 'entity')
            : null;
        const outcome = {
            status: 'complete',
            entity: entity && tenancy ? { ...entity, tenancy } : entity,
            credential: credential && {
                ...credential,
                type: entityType,
                entityIds: entity ? [String(entity.id)] : [],
                ...(tenancy && { tenancy }),
            },
        };
        if (credentialId && String(callback.credential_id) !== String(credentialId)) {
            // The provider account differs from the one being re-authorized,
            // so a separate credential was stored.
            outcome.previousCredentialId = String(credentialId);
        }
        return outcome;
    }
}

module.exports = {
    GetAuthorizationStep,
    SubmitAuthorizationStep,
    toAuthorizationError,
    isMultiStep,
};
