/**
 * Base WorkflowStep Class
 * 
 * Abstract base class for all workflow step types.
 * Defines the common interface and properties that all steps must implement.
 */
class WorkflowStep {
    /**
     * Creates a new WorkflowStep
     * 
     * @param {Object} params - Step parameters
     * @param {string} params.id - Unique step identifier
     * @param {string} params.name - Human-readable step name
     * @param {string} params.type - Step type (FUNCTION, FAN_OUT)
     * @param {string} params.description - Step description
     * @param {Object} params.config - Step-specific configuration
     * @param {Array} params.nextSteps - Array of next step IDs
     */
    constructor({ id, name, type, description, config, nextSteps }) {
        if (this.constructor === WorkflowStep) {
            throw new Error('WorkflowStep is an abstract class and cannot be instantiated directly');
        }

        this.id = id;
        this.name = name;
        this.type = type;
        this.description = description;
        this.config = config || {};
        this.nextSteps = nextSteps || [];
    }

    /**
     * Add a next step to this step's execution chain
     * @param {string} stepId - ID of the next step
     */
    addNextStep(stepId) {
        if (!this.nextSteps.includes(stepId)) {
            this.nextSteps.push(stepId);
        }
    }

    /**
     * Remove a next step from this step's execution chain
     * @param {string} stepId - ID of the step to remove
     */
    removeNextStep(stepId) {
        this.nextSteps = this.nextSteps.filter(id => id !== stepId);
    }

    /**
     * Check if this step has any next steps
     * @returns {boolean} True if there are next steps
     */
    hasNextSteps() {
        return this.nextSteps.length > 0;
    }

    /**
     * Validate step configuration
     * This method should be overridden by subclasses to implement specific validation
     * @throws {Error} If configuration is invalid
     */
    validate() {
        if (!this.id) {
            throw new Error('Step ID is required');
        }
        if (!this.name) {
            throw new Error('Step name is required');
        }
        if (!this.type) {
            throw new Error('Step type is required');
        }
    }

    /**
     * Get step configuration for serialization
     * @returns {Object} Step configuration object
     */
    toConfig() {
        return {
            id: this.id,
            name: this.name,
            type: this.type,
            description: this.description,
            config: this.config,
            nextSteps: this.nextSteps
        };
    }

    /**
     * Create a step instance from configuration
     * @param {Object} config - Step configuration
     * @returns {WorkflowStep} Step instance
     */
    static fromConfig(config) {
        // This will be implemented by the factory pattern
        throw new Error('fromConfig must be implemented by step factory');
    }

    /**
     * Get step summary for display
     * @returns {Object} Step summary
     */
    getSummary() {
        return {
            id: this.id,
            name: this.name,
            type: this.type,
            description: this.description,
            nextStepsCount: this.nextSteps.length
        };
    }
}

module.exports = { WorkflowStep };