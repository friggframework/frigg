/**
 * Process Authorization Step Use Case
 * Business logic for processing individual steps in multi-step authorization workflows
 *
 * Responsibilities:
 * - Load and validate authorization session
 * - Verify step sequence and user ownership
 * - Delegate to module's step processing logic
 * - Update session state and persist changes
 * - Return next step requirements or completion data
 *
 * @example
 * ```javascript
 * const useCase = new ProcessAuthorizationStepUseCase({
 *     authSessionRepository: createAuthorizationSessionRepository(),
 *     moduleDefinitions: [{ moduleName: 'nagaris', definition: NagarisDefinition, apiClass: NagarisApi }]
 * });
 *
 * // Process step 1 (email submission)
 * const result = await useCase.execute('session-id', 'user123', 1, { email: 'user@example.com' });
 * // Returns: { nextStep: 2, sessionId, requirements: {...}, message: 'OTP sent to email' }
 *
 * // Process step 2 (OTP verification)
 * const result = await useCase.execute('session-id', 'user123', 2, { email: 'user@example.com', otp: '123456' });
 * // Returns: { completed: true, authData: {...}, sessionId }
 * ```
 */
class ProcessAuthorizationStepUseCase {
    /**
     * @param {Object} params - Dependencies
     * @param {import('../repositories/authorization-session-repository-interface').AuthorizationSessionRepositoryInterface} params.authSessionRepository - Session repository
     * @param {Array<Object>} params.moduleDefinitions - Array of module definitions with structure: { moduleName, definition, apiClass }
     */
    constructor({ authSessionRepository, moduleDefinitions }) {
        if (!authSessionRepository) {
            throw new Error('authSessionRepository is required');
        }
        if (!moduleDefinitions || !Array.isArray(moduleDefinitions)) {
            throw new Error('moduleDefinitions array is required');
        }
        this.authSessionRepository = authSessionRepository;
        this.moduleDefinitions = moduleDefinitions;
    }

    /**
     * Process a single step of multi-step authorization
     *
     * @param {string} sessionId - Unique session identifier
     * @param {string} userId - User ID (for security validation)
     * @param {number} step - Current step number being processed
     * @param {Object} stepData - Data submitted for this step
     * @returns {Promise<Object>} Result object with nextStep info or completion data
     * @throws {Error} If session not found, validation fails, or step processing fails
     */
    async execute(sessionId, userId, step, stepData) {
        // Validate inputs
        if (!sessionId) {
            throw new Error('sessionId is required');
        }
        if (!userId) {
            throw new Error('userId is required');
        }
        if (!step || step < 1) {
            throw new Error('step must be >= 1');
        }
        if (!stepData || typeof stepData !== 'object') {
            throw new Error('stepData object is required');
        }

        // Load session from repository
        const session = await this.authSessionRepository.findBySessionId(
            sessionId
        );

        if (!session) {
            throw new Error('Authorization session not found or expired');
        }

        // Security: Verify session belongs to this user
        if (session.userId !== userId) {
            throw new Error('Session does not belong to this user');
        }

        // Verify session hasn't expired (double-check beyond repository filter)
        if (session.isExpired()) {
            throw new Error('Authorization session has expired');
        }

        // Validate step sequence - prevent skipping steps
        // Allow step 1 to be re-submitted (restart flow), otherwise must be sequential
        if (session.currentStep !== step && step !== 1) {
            throw new Error(
                `Expected step ${session.currentStep}, received step ${step}`
            );
        }

        // Find module definition for this entity type
        const moduleDefinition = this.moduleDefinitions.find(
            (def) => def.moduleName === session.entityType
        );

        if (!moduleDefinition) {
            throw new Error(
                `Module definition not found: ${session.entityType}`
            );
        }

        // Get module's Definition class
        const ModuleDefinition = moduleDefinition.definition;

        // Validate module supports multi-step auth
        if (!ModuleDefinition.processAuthorizationStep) {
            throw new Error(
                `Module ${session.entityType} does not support multi-step authorization`
            );
        }

        // Create API instance for this step
        const ApiClass = moduleDefinition.apiClass;
        const api = new ApiClass({ userId });

        // Delegate to module's step processing logic
        const result = await ModuleDefinition.processAuthorizationStep(
            api,
            step,
            stepData,
            session.stepData // Pass accumulated data from previous steps
        );

        // Handle final step completion
        if (result.completed) {
            session.markComplete();
            await this.authSessionRepository.update(session);

            return {
                completed: true,
                authData: result.authData,
                sessionId,
            };
        }

        // Handle intermediate step - advance session
        session.advanceStep(result.stepData || {});
        await this.authSessionRepository.update(session);

        // Get requirements for next step
        const nextRequirements =
            await ModuleDefinition.getAuthRequirementsForStep(result.nextStep);

        return {
            nextStep: result.nextStep,
            totalSteps: session.maxSteps,
            sessionId,
            requirements: nextRequirements,
            message: result.message || undefined,
        };
    }
}

module.exports = { ProcessAuthorizationStepUseCase };
