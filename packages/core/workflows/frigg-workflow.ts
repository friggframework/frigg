const { v4: uuid } = require('uuid');

/**
 * FriggWorkflow Fluent API Builder
 * 
 * Provides a simple, developer-friendly interface for building workflows.
 * Focuses on linear step execution with automatic chaining.
 */
class FriggWorkflow {
    /**
     * Creates a new FriggWorkflow builder
     * 
     * @param {Object} config - Workflow configuration
     * @param {string} config.name - Workflow name
     * @param {string} config.description - Workflow description
     * @param {string} config.userId - User ID who owns this workflow
     * @param {string} config.integrationId - Integration ID this workflow belongs to
     */
    constructor({ name, description, userId, integrationId }) {
        this.name = name;
        this.description = description;
        this.userId = userId;
        this.integrationId = integrationId;
        this.steps = [];
        this.triggers = [];
        this.currentStepId = 0;
        this.stepNameMap = new Map();
        this.lastStepId = null;
    }

    /**
     * Add a trigger to the workflow
     * 
     * @param {Object} config - Trigger configuration
     * @param {string} config.type - Trigger type (MANUAL, WEBHOOK, EVENT, SCHEDULE)
     * @param {string} config.name - Trigger name
     * @param {Object} config.config - Trigger-specific configuration
     * @returns {FriggWorkflow} This instance for chaining
     */
    addTrigger({ type, name, config = {} }) {
        const trigger = {
            id: `trigger_${this.triggers.length}`,
            type, // 'MANUAL', 'WEBHOOK', 'EVENT', 'SCHEDULE'
            name,
            config
        };
        
        this.triggers.push(trigger);
        return this;
    }

    /**
     * Add a step to the workflow
     * 
     * @param {Object} config - Step configuration
     * @param {string} config.name - Step name
     * @param {string} config.description - Step description (optional)
     * @param {string} config.handler - Method name to call on integration class
     * @param {number} config.timeout - Execution timeout in milliseconds (optional)
     * @param {Object} config.retryPolicy - Retry configuration (optional)
     * @returns {FriggWorkflow} This instance for chaining
     */
    addStep({ name, description, handler, timeout, retryPolicy }) {
        const stepId = `step_${this.currentStepId++}`;
        const step = {
            id: stepId,
            name,
            description,
            type: 'FUNCTION',
            handler,
            timeout: timeout || 300000, // 5 minutes default
            retryPolicy: retryPolicy || {
                maxRetries: 3,
                backoffStrategy: 'exponential',
                baseDelay: 1000
            },
            nextSteps: []
        };
        
        // Auto-link to previous step if exists
        this.linkToPreviousStep(stepId);
        
        this.steps.push(step);
        this.stepNameMap.set(name, stepId);
        this.lastStepId = stepId;
        
        return this;
    }


    /**
     * Add a fan-out step for parallel processing of large datasets
     * 
     * @param {Object} config - Fan-out step configuration
     * @param {string} config.name - Step name
     * @param {string} config.description - Step description (optional)
     * @param {string} config.handler - Handler method for each batch
     * @param {number} config.batchSize - Items per batch (default: 100)
     * @param {string} config.fanOutType - Type of fan-out: 'PAGINATION' or 'DATA_PROCESSING' (default)
     * @param {string} config.dependsOn - Step name this fan-out depends on for data (optional, defaults to previous step)
     * @param {number} config.maxConcurrency - Max concurrent batches (default: 10)
     * @returns {FriggWorkflow} This instance for chaining
     */
    addFanOut({ 
        name, 
        description, 
        handler, 
        batchSize = 100, 
        fanOutType = 'DATA_PROCESSING',
        dependsOn,
        maxConcurrency = 10
    }) {
        const stepId = `step_${this.currentStepId++}`;
        const step = {
            id: stepId,
            name,
            description,
            type: 'FAN_OUT',
            handler,
            batchSize,
            fanOutType,
            dependsOn: dependsOn || (this.steps.length > 0 ? this.steps[this.steps.length - 1].name : null),
            maxConcurrency,
            nextSteps: []
        };
        
        // Auto-link to previous step if exists
        this.linkToPreviousStep(stepId);
        
        this.steps.push(step);
        this.stepNameMap.set(name, stepId);
        this.lastStepId = stepId;
        
        return this;
    }


    /**
     * Add tags to the workflow for categorization
     * 
     * @param {Array<string>} tags - Array of tag strings
     * @returns {FriggWorkflow} This instance for chaining
     */
    addTags(tags) {
        this.tags = this.tags || [];
        this.tags.push(...tags);
        return this;
    }

    /**
     * Set workflow category
     * 
     * @param {string} category - Workflow category
     * @returns {FriggWorkflow} This instance for chaining
     */
    setCategory(category) {
        this.category = category;
        return this;
    }

    /**
     * Set workflow version
     * 
     * @param {string} version - Workflow version
     * @returns {FriggWorkflow} This instance for chaining
     */
    setVersion(version) {
        this.version = version;
        return this;
    }

    /**
     * Auto-link current step to previous step
     * @param {string} currentStepId - Current step ID
     */
    linkToPreviousStep(currentStepId) {
        if (this.lastStepId) {
            const previousStep = this.steps.find(s => s.id === this.lastStepId);
            if (previousStep && !previousStep.nextSteps.includes(currentStepId)) {
                previousStep.nextSteps.push(currentStepId);
            }
        }
    }

    /**
     * Validate the workflow configuration
     * @throws {Error} If workflow is invalid
     */
    validate() {
        if (!this.name || this.name.trim().length === 0) {
            throw new Error('Workflow name is required');
        }
        
        if (this.steps.length === 0) {
            throw new Error('Workflow must have at least one step');
        }
        
        // Validate step names are unique
        const stepNames = this.steps.map(s => s.name);
        const duplicateNames = stepNames.filter((name, index) => stepNames.indexOf(name) !== index);
        if (duplicateNames.length > 0) {
            throw new Error(`Duplicate step names found: ${duplicateNames.join(', ')}`);
        }
        
        // Validate fan-out dependencies
        for (const step of this.steps) {
            if (step.type === 'FAN_OUT' && step.dependsOn) {
                if (!this.stepNameMap.has(step.dependsOn)) {
                    throw new Error(`Fan-out step "${step.name}" depends on non-existent step: ${step.dependsOn}`);
                }
            }
        }
    }

    /**
     * Build the workflow definition
     * 
     * @returns {Object} Complete workflow configuration
     */
    build() {
        this.validate();
        
        return {
            name: this.name,
            description: this.description,
            userId: this.userId,
            integrationId: this.integrationId,
            definition: {
                steps: this.steps,
                triggers: this.triggers
            },
            metadata: {
                version: this.version || '1.0.0',
                tags: this.tags || [],
                category: this.category,
                builderVersion: '1.0.0',
                createdWith: 'FriggWorkflow'
            }
        };
    }

    /**
     * Get workflow summary for display
     * @returns {Object} Workflow summary
     */
    getSummary() {
        return {
            name: this.name,
            description: this.description,
            stepCount: this.steps.length,
            triggerCount: this.triggers.length,
            hasFanOuts: this.steps.some(s => s.type === 'FAN_OUT'),
            tags: this.tags || [],
            category: this.category
        };
    }

    /**
     * Export workflow as JSON string
     * @param {boolean} pretty - Whether to format JSON nicely
     * @returns {string} JSON representation
     */
    toJSON(pretty = false) {
        const definition = this.build();
        return pretty ? JSON.stringify(definition, null, 2) : JSON.stringify(definition);
    }

    /**
     * Create FriggWorkflow from existing definition
     * @param {Object} definition - Existing workflow definition
     * @returns {FriggWorkflow} New FriggWorkflow instance
     */
    static fromDefinition(definition) {
        const workflow = new FriggWorkflow({
            name: definition.name,
            description: definition.description,
            userId: definition.userId,
            integrationId: definition.integrationId
        });
        
        // Restore triggers
        workflow.triggers = definition.definition.triggers || [];
        
        // Restore steps
        workflow.steps = definition.definition.steps || [];
        workflow.currentStepId = workflow.steps.length;
        
        // Rebuild step name map
        workflow.stepNameMap.clear();
        workflow.steps.forEach(step => {
            workflow.stepNameMap.set(step.name, step.id);
        });
        
        // Restore metadata
        if (definition.metadata) {
            workflow.version = definition.metadata.version;
            workflow.tags = definition.metadata.tags;
            workflow.category = definition.metadata.category;
        }
        
        return workflow;
    }

    /**
     * Clone this workflow with a new name
     * @param {string} newName - New workflow name
     * @returns {FriggWorkflow} Cloned workflow
     */
    clone(newName) {
        const definition = this.build();
        definition.name = newName;
        
        // Generate new IDs for steps (since they auto-chain, we just need new IDs)
        definition.definition.steps.forEach((step, index) => {
            step.id = `step_${index}`;
        });
        
        return FriggWorkflow.fromDefinition(definition);
    }
}

module.exports = { FriggWorkflow };