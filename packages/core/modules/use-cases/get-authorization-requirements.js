/**
 * Get Authorization Requirements Use Case
 * Business logic for retrieving authorization requirements for a specific step
 *
 * Responsibilities:
 * - Find module definition for entity type
 * - Determine step count (single vs multi-step)
 * - Retrieve step-specific requirements (jsonSchema, uiSchema, etc.)
 * - Return structured requirements for frontend rendering
 *
 * Supports both single-step and multi-step modules:
 * - Single-step: Uses getAuthorizationRequirements() (legacy)
 * - Multi-step: Uses getAuthRequirementsForStep(step) (new)
 *
 * @example
 * ```javascript
 * const useCase = new GetAuthorizationRequirementsUseCase({
 *     moduleDefinitions: [{ moduleName: 'nagaris', definition: NagarisDefinition }]
 * });
 *
 * // Get requirements for step 1
 * const reqs = await useCase.execute('nagaris', 1);
 * // Returns: { type: 'email', data: { jsonSchema, uiSchema }, step: 1, totalSteps: 2, isMultiStep: true }
 *
 * // Get requirements for step 2
 * const reqs = await useCase.execute('nagaris', 2);
 * // Returns: { type: 'otp', data: { jsonSchema, uiSchema }, step: 2, totalSteps: 2, isMultiStep: true }
 * ```
 */
class GetAuthorizationRequirementsUseCase {
    /**
     * @param {Object} params - Dependencies
     * @param {Array<Object>} params.moduleDefinitions - Array of module definitions with structure: { moduleName, definition }
     */
    constructor({ moduleDefinitions }) {
        if (!moduleDefinitions || !Array.isArray(moduleDefinitions)) {
            throw new Error('moduleDefinitions array is required');
        }
        this.moduleDefinitions = moduleDefinitions;
    }

    /**
     * Get authorization requirements for a specific step
     *
     * @param {string} entityType - Entity type (module name)
     * @param {number} [step=1] - Step number (1-indexed)
     * @returns {Promise<Object>} Requirements object with schema and metadata
     * @throws {Error} If module not found or step invalid
     */
    async execute(entityType, step = 1) {
        // Validate inputs
        if (!entityType) {
            throw new Error('entityType is required');
        }
        if (!step || step < 1) {
            throw new Error('step must be >= 1');
        }

        // Find module definition
        const moduleDefinition = this.moduleDefinitions.find(
            (def) => def.moduleName === entityType
        );

        if (!moduleDefinition) {
            throw new Error(`Module definition not found: ${entityType}`);
        }

        const ModuleDefinition = moduleDefinition.definition;

        // Determine step count (multi-step vs single-step)
        const stepCount = ModuleDefinition.getAuthStepCount
            ? ModuleDefinition.getAuthStepCount()
            : 1;

        // Validate requested step doesn't exceed max steps
        if (step > stepCount) {
            throw new Error(
                `Step ${step} exceeds maximum steps (${stepCount}) for ${entityType}`
            );
        }

        // Get requirements for this specific step
        let requirements;

        if (ModuleDefinition.getAuthRequirementsForStep) {
            // Multi-step module - use step-specific method
            requirements = await ModuleDefinition.getAuthRequirementsForStep(
                step
            );
        } else if (step === 1) {
            // Single-step module (legacy) - use standard method
            requirements =
                await ModuleDefinition.getAuthorizationRequirements();
        } else {
            throw new Error(
                `Module ${entityType} does not support step ${step}`
            );
        }

        // Return enriched requirements with metadata
        return {
            ...requirements,
            step,
            totalSteps: stepCount,
            isMultiStep: stepCount > 1,
        };
    }
}

module.exports = { GetAuthorizationRequirementsUseCase };
