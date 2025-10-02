/**
 * AuthorizationSession Entity
 * Domain entity for multi-step authorization workflows
 *
 * Manages state for authentication flows that require multiple steps,
 * such as OTP verification, multi-factor authentication, or progressive
 * credential collection.
 *
 * @example
 * const session = new AuthorizationSession({
 *     sessionId: '550e8400-e29b-41d4-a716-446655440000',
 *     userId: 'user123',
 *     entityType: 'nagaris',
 *     currentStep: 1,
 *     maxSteps: 2,
 *     stepData: { email: 'user@example.com' },
 *     expiresAt: new Date(Date.now() + 15 * 60 * 1000)
 * });
 */
class AuthorizationSession {
    /**
     * Create an authorization session
     *
     * @param {Object} params - Session parameters
     * @param {string} params.sessionId - Unique session identifier (UUID)
     * @param {string} params.userId - User ID who initiated the auth flow
     * @param {string} params.entityType - Type of entity being authorized (module name)
     * @param {number} [params.currentStep=1] - Current step in the auth flow
     * @param {number} params.maxSteps - Total number of steps in the flow
     * @param {Object} [params.stepData={}] - Accumulated data from previous steps
     * @param {Date} params.expiresAt - Session expiration timestamp
     * @param {boolean} [params.completed=false] - Whether auth flow is complete
     * @param {Date} [params.createdAt=new Date()] - Session creation timestamp
     * @param {Date} [params.updatedAt=new Date()] - Last update timestamp
     */
    constructor({
        sessionId,
        userId,
        entityType,
        currentStep = 1,
        maxSteps,
        stepData = {},
        expiresAt,
        completed = false,
        createdAt = new Date(),
        updatedAt = new Date(),
    }) {
        this.sessionId = sessionId;
        this.userId = userId;
        this.entityType = entityType;
        this.currentStep = currentStep;
        this.maxSteps = maxSteps;
        this.stepData = stepData;
        this.expiresAt = expiresAt;
        this.completed = completed;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;

        this.validate();
    }

    /**
     * Validate session state
     *
     * @throws {Error} If validation fails
     */
    validate() {
        if (!this.sessionId) {
            throw new Error('Session ID is required');
        }
        if (!this.userId) {
            throw new Error('User ID is required');
        }
        if (!this.entityType) {
            throw new Error('Entity type is required');
        }
        if (this.currentStep < 1) {
            throw new Error('Step must be >= 1');
        }
        if (this.currentStep > this.maxSteps) {
            throw new Error('Current step cannot exceed max steps');
        }
        if (this.expiresAt < new Date()) {
            throw new Error('Session has expired');
        }
    }

    /**
     * Advance to next step with new data
     *
     * @param {Object} newStepData - Data collected from current step
     * @throws {Error} If session is already completed
     */
    advanceStep(newStepData) {
        if (this.completed) {
            throw new Error('Cannot advance completed session');
        }

        this.currentStep += 1;
        this.stepData = { ...this.stepData, ...newStepData };
        this.updatedAt = new Date();
    }

    /**
     * Mark session as complete
     */
    markComplete() {
        this.completed = true;
        this.updatedAt = new Date();
    }

    /**
     * Check if session has expired
     *
     * @returns {boolean} True if session is expired
     */
    isExpired() {
        return this.expiresAt < new Date();
    }

    /**
     * Check if session can advance to next step
     *
     * @returns {boolean} True if session can advance
     */
    canAdvance() {
        return !this.completed && this.currentStep < this.maxSteps;
    }
}

module.exports = { AuthorizationSession };
