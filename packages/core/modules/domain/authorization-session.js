const crypto = require('node:crypto');

const DEFAULT_TTL_MINUTES = 15;

function sessionTtlMs() {
    const minutes = parseInt(process.env.AUTH_SESSION_EXPIRY_MINUTES || '', 10);
    return (Number.isInteger(minutes) && minutes > 0 ? minutes : DEFAULT_TTL_MINUTES) * 60 * 1000;
}

/**
 * State of one multi-step authorization (Management API v2
 * `/api/v2/authorize` and `/api/v2/credentials/:id/reauthorize`).
 *
 * `stepData` holds what earlier steps collected (for example the email an OTP
 * was sent to) and is encrypted at rest (encryption-schema-registry). A
 * session is bound to the user who started it, the entity type, and, for a
 * re-authorization, the credential being renewed.
 */
class AuthorizationSession {
    /**
     * @param {Object} params
     * @param {string} params.sessionId - unguessable id (UUID v4)
     * @param {string} params.userId
     * @param {string} params.entityType - module name
     * @param {string|null} [params.credentialId] - set for re-authorization
     * @param {number} [params.currentStep=1] - the step the caller submits next
     * @param {number} params.maxSteps
     * @param {Object} [params.stepData={}]
     * @param {Date} params.expiresAt
     * @param {boolean} [params.completed=false]
     * @param {Date} [params.createdAt]
     * @param {Date} [params.updatedAt]
     */
    constructor({
        sessionId,
        userId,
        entityType,
        credentialId = null,
        currentStep = 1,
        maxSteps,
        stepData = {},
        expiresAt,
        completed = false,
        createdAt = new Date(),
        updatedAt = new Date(),
    }) {
        this.sessionId = sessionId;
        this.userId = userId === undefined || userId === null ? userId : String(userId);
        this.entityType = entityType;
        this.credentialId =
            credentialId === undefined || credentialId === null ? null : String(credentialId);
        this.currentStep = currentStep;
        this.maxSteps = maxSteps;
        this.stepData = stepData && typeof stepData === 'object' ? stepData : {};
        this.expiresAt = expiresAt instanceof Date ? expiresAt : new Date(expiresAt);
        this.completed = completed;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
        this.validate();
    }

    /**
     * A new session for step 1, expiring after AUTH_SESSION_EXPIRY_MINUTES
     * (default 15).
     */
    static start({ userId, entityType, maxSteps, credentialId = null, now = new Date() }) {
        return new AuthorizationSession({
            sessionId: crypto.randomUUID(),
            userId,
            entityType,
            credentialId,
            currentStep: 1,
            maxSteps,
            stepData: {},
            expiresAt: new Date(now.getTime() + sessionTtlMs()),
            completed: false,
            createdAt: now,
            updatedAt: now,
        });
    }

    validate() {
        if (!this.sessionId) throw new Error('sessionId is required');
        if (!this.userId) throw new Error('userId is required');
        if (!this.entityType) throw new Error('entityType is required');
        if (!Number.isInteger(this.maxSteps) || this.maxSteps < 1) {
            throw new Error('maxSteps must be a positive integer');
        }
        if (
            !Number.isInteger(this.currentStep) ||
            this.currentStep < 1 ||
            this.currentStep > this.maxSteps
        ) {
            throw new Error(`currentStep must be between 1 and ${this.maxSteps}`);
        }
        if (Number.isNaN(this.expiresAt.getTime())) {
            throw new Error('expiresAt must be a valid date');
        }
    }

    isExpired(now = new Date()) {
        return this.expiresAt.getTime() <= now.getTime();
    }

    /** True when this session may be used by `userId` for `entityType`/`credentialId`. */
    belongsTo({ userId, entityType, credentialId = null }) {
        return (
            this.userId === String(userId) &&
            this.entityType === entityType &&
            this.credentialId === (credentialId === null || credentialId === undefined ? null : String(credentialId))
        );
    }

    /**
     * Records a finished step and moves to `nextStep`, merging what the step
     * collected into stepData.
     */
    advanceTo(nextStep, collected = {}) {
        if (this.completed) throw new Error('Cannot advance a completed session');
        if (nextStep !== this.currentStep + 1 || nextStep > this.maxSteps) {
            throw new Error(
                `Cannot move from step ${this.currentStep} to step ${nextStep} of ${this.maxSteps}`
            );
        }
        this.currentStep = nextStep;
        this.stepData = { ...this.stepData, ...(collected || {}) };
        this.updatedAt = new Date();
    }

    /** Starts the flow over at step 1, forgetting collected data. */
    restart() {
        this.currentStep = 1;
        this.stepData = {};
        this.completed = false;
        this.updatedAt = new Date();
    }

    markComplete() {
        this.completed = true;
        this.updatedAt = new Date();
    }
}

module.exports = { AuthorizationSession, DEFAULT_TTL_MINUTES };
