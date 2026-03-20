/**
 * Workflow Domain Object
 * 
 * Represents a complete workflow definition with its metadata and configuration.
 * This is the core entity that defines how a workflow should be executed.
 */
class Workflow {
    /**
     * Creates a new Workflow domain object
     * 
     * @param {Object} params - Workflow parameters
     * @param {string} params.id - Unique workflow identifier
     * @param {string} params.name - Human-readable workflow name
     * @param {string} params.description - Workflow description
     * @param {string} params.integrationId - Associated integration ID
     * @param {string} params.userId - User who owns this workflow
     * @param {string} params.status - Workflow status (ACTIVE, PAUSED, ERROR, DISABLED)
     * @param {Object} params.definition - Workflow step definitions and triggers
     * @param {Object} params.metadata - Created/updated timestamps, version, etc.
     */
    constructor({ id, name, description, integrationId, userId, status, definition, metadata }) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.integrationId = integrationId;
        this.userId = userId;
        this.status = status || 'ACTIVE'; // 'ACTIVE', 'PAUSED', 'ERROR', 'DISABLED'
        this.definition = definition || { steps: [], triggers: [] };
        this.metadata = metadata || {
            createdAt: new Date(),
            updatedAt: new Date(),
            version: '1.0.0'
        };
        this.steps = new Map(); // Step instances for runtime access
    }

    /**
     * Get the first step in the workflow definition
     * @returns {Object|null} First step or trigger step
     */
    getFirstStep() {
        if (!this.definition.steps || this.definition.steps.length === 0) {
            return null;
        }

        // Look for trigger step first
        const triggerStep = this.definition.steps.find(step => step.type === 'TRIGGER');
        if (triggerStep) {
            return triggerStep;
        }

        // Return first step if no trigger
        return this.definition.steps[0];
    }

    /**
     * Get all trigger configurations for this workflow
     * @returns {Array} Array of trigger configurations
     */
    getTriggers() {
        return this.definition.triggers || [];
    }

    /**
     * Find next steps to execute after a given step
     * @param {string} stepId - Current step ID
     * @returns {Array} Array of next step configurations
     */
    getNextSteps(stepId) {
        const currentStep = this.definition.steps.find(step => step.id === stepId);
        if (!currentStep || !currentStep.nextSteps) {
            return [];
        }

        return currentStep.nextSteps.map(nextStepId => 
            this.definition.steps.find(step => step.id === nextStepId)
        ).filter(Boolean);
    }

    /**
     * Check if workflow is executable
     * @returns {boolean} True if workflow can be executed
     */
    isExecutable() {
        return this.status === 'ACTIVE' && 
               this.definition.steps && 
               this.definition.steps.length > 0;
    }

    /**
     * Update workflow status
     * @param {string} newStatus - New status to set
     */
    updateStatus(newStatus) {
        this.status = newStatus;
        this.metadata.updatedAt = new Date();
    }

    /**
     * Get workflow summary for display
     * @returns {Object} Workflow summary object
     */
    getSummary() {
        return {
            id: this.id,
            name: this.name,
            description: this.description,
            status: this.status,
            stepCount: this.definition.steps ? this.definition.steps.length : 0,
            triggerCount: this.definition.triggers ? this.definition.triggers.length : 0,
            createdAt: this.metadata.createdAt,
            version: this.metadata.version
        };
    }
}

module.exports = { Workflow };