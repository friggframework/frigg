const { StepFactory } = require('../steps');

/**
 * CreateWorkflow Use Case
 * 
 * Handles the creation of new workflows with validation and persistence.
 * Validates workflow definition, checks user permissions, and stores the workflow.
 */
class CreateWorkflow {
    /**
     * Creates a new CreateWorkflow use case
     * 
     * @param {Object} dependencies - Use case dependencies
     * @param {WorkflowRepository} dependencies.workflowRepository - Workflow repository
     * @param {IntegrationRepository} dependencies.integrationRepository - Integration repository
     * @param {Object} dependencies.logger - Logger instance
     */
    constructor({ workflowRepository, integrationRepository, logger = console }) {
        this.workflowRepository = workflowRepository;
        this.integrationRepository = integrationRepository;
        this.logger = logger;
    }

    /**
     * Execute workflow creation
     * 
     * @param {string} userId - ID of the user creating the workflow
     * @param {string} integrationId - ID of the integration this workflow belongs to
     * @param {Object} workflowConfig - Workflow configuration
     * @param {string} workflowConfig.name - Workflow name
     * @param {string} workflowConfig.description - Workflow description
     * @param {Object} workflowConfig.definition - Workflow step and trigger definitions
     * @param {Array} workflowConfig.definition.steps - Array of step configurations
     * @param {Array} workflowConfig.definition.triggers - Array of trigger configurations
     * @param {Object} workflowConfig.metadata - Optional metadata
     * @returns {Promise<Workflow>} Created workflow domain object
     */
    async execute(userId, integrationId, workflowConfig) {
        this.logger.log(`Creating workflow "${workflowConfig.name}" for user ${userId}, integration ${integrationId}`);

        try {
            // 1. Validate user access to integration
            await this.validateUserAccess(userId, integrationId);

            // 2. Validate workflow configuration
            this.validateWorkflowConfig(workflowConfig);

            // 3. Validate workflow definition
            await this.validateWorkflowDefinition(workflowConfig.definition);

            // 4. Check for workflow name conflicts
            await this.validateWorkflowName(integrationId, workflowConfig.name);

            // 5. Create workflow domain object
            const workflow = await this.workflowRepository.createWorkflow({
                name: workflowConfig.name,
                description: workflowConfig.description,
                integrationId,
                userId,
                status: 'ACTIVE',
                definition: workflowConfig.definition,
                metadata: {
                    createdAt: new Date(),
                    updatedAt: new Date(),
                    version: workflowConfig.version || '1.0.0',
                    tags: workflowConfig.tags || [],
                    category: workflowConfig.category,
                    ...workflowConfig.metadata
                }
            });

            this.logger.log(`Successfully created workflow ${workflow.id} for integration ${integrationId}`);
            return workflow;

        } catch (error) {
            this.logger.error(`Failed to create workflow: ${error.message}`, {
                userId,
                integrationId,
                workflowName: workflowConfig.name,
                error: error.stack
            });
            throw error;
        }
    }

    /**
     * Validate user has access to the integration
     * @param {string} userId - User ID
     * @param {string} integrationId - Integration ID
     * @throws {Error} If user doesn't have access
     */
    async validateUserAccess(userId, integrationId) {
        // Check if integration exists and user has access
        const integration = await this.integrationRepository.findByIdAndUserId(integrationId, userId);
        
        if (!integration) {
            throw new Error(`Integration ${integrationId} not found or access denied for user ${userId}`);
        }

        // Check if integration is in a valid state for workflow creation
        if (integration.status === 'DISABLED' || integration.status === 'ERROR') {
            throw new Error(`Cannot create workflow for integration in ${integration.status} state`);
        }
    }

    /**
     * Validate workflow configuration structure
     * @param {Object} workflowConfig - Workflow configuration
     * @throws {Error} If configuration is invalid
     */
    validateWorkflowConfig(workflowConfig) {
        if (!workflowConfig) {
            throw new Error('Workflow configuration is required');
        }

        if (!workflowConfig.name || typeof workflowConfig.name !== 'string') {
            throw new Error('Workflow name is required and must be a string');
        }

        if (workflowConfig.name.trim().length === 0) {
            throw new Error('Workflow name cannot be empty');
        }

        if (workflowConfig.name.length > 200) {
            throw new Error('Workflow name cannot exceed 200 characters');
        }

        if (workflowConfig.description && workflowConfig.description.length > 1000) {
            throw new Error('Workflow description cannot exceed 1000 characters');
        }

        if (!workflowConfig.definition) {
            throw new Error('Workflow definition is required');
        }

        if (!workflowConfig.definition.steps || !Array.isArray(workflowConfig.definition.steps)) {
            throw new Error('Workflow definition must include a steps array');
        }

        if (workflowConfig.definition.steps.length === 0) {
            throw new Error('Workflow must have at least one step');
        }

        if (workflowConfig.definition.steps.length > 50) {
            throw new Error('Workflow cannot have more than 50 steps');
        }
    }

    /**
     * Validate workflow definition structure and step configurations
     * @param {Object} definition - Workflow definition
     * @throws {Error} If definition is invalid
     */
    async validateWorkflowDefinition(definition) {
        const { steps, triggers } = definition;

        // Validate triggers
        if (triggers && Array.isArray(triggers)) {
            for (const trigger of triggers) {
                this.validateTriggerConfig(trigger);
            }
        }

        // Validate steps
        const stepIds = new Set();
        const stepNames = new Set();

        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            
            // Validate step structure
            this.validateStepStructure(step, i);
            
            // Check for duplicate IDs and names
            if (stepIds.has(step.id)) {
                throw new Error(`Duplicate step ID: ${step.id}`);
            }
            if (stepNames.has(step.name)) {
                throw new Error(`Duplicate step name: ${step.name}`);
            }
            
            stepIds.add(step.id);
            stepNames.add(step.name);

            // Validate step-specific configuration
            await this.validateStepConfig(step);
        }

        // Validate step dependencies and next steps
        this.validateStepDependencies(steps, stepIds);
    }

    /**
     * Validate individual step structure
     * @param {Object} step - Step configuration
     * @param {number} index - Step index for error reporting
     * @throws {Error} If step structure is invalid
     */
    validateStepStructure(step, index) {
        if (!step.id || typeof step.id !== 'string') {
            throw new Error(`Step ${index}: ID is required and must be a string`);
        }

        if (!step.name || typeof step.name !== 'string') {
            throw new Error(`Step ${index}: name is required and must be a string`);
        }

        if (!step.type || typeof step.type !== 'string') {
            throw new Error(`Step ${index}: type is required and must be a string`);
        }

        const supportedTypes = StepFactory.getSupportedTypes();
        if (!supportedTypes.includes(step.type)) {
            throw new Error(`Step ${index}: unsupported step type "${step.type}". Supported types: ${supportedTypes.join(', ')}`);
        }

        if (step.nextSteps && !Array.isArray(step.nextSteps)) {
            throw new Error(`Step ${index}: nextSteps must be an array`);
        }

        if (step.dependencies && !Array.isArray(step.dependencies)) {
            throw new Error(`Step ${index}: dependencies must be an array`);
        }
    }

    /**
     * Validate step-specific configuration using step factory
     * @param {Object} stepConfig - Step configuration
     * @throws {Error} If step configuration is invalid
     */
    async validateStepConfig(stepConfig) {
        try {
            // Create step instance to validate configuration
            const step = StepFactory.createStep(stepConfig);
            step.validate();
        } catch (error) {
            throw new Error(`Step "${stepConfig.name}": ${error.message}`);
        }
    }

    /**
     * Validate trigger configuration
     * @param {Object} trigger - Trigger configuration
     * @throws {Error} If trigger configuration is invalid
     */
    validateTriggerConfig(trigger) {
        if (!trigger.type || typeof trigger.type !== 'string') {
            throw new Error('Trigger type is required and must be a string');
        }

        const supportedTriggerTypes = ['MANUAL', 'WEBHOOK', 'SCHEDULE', 'EVENT'];
        if (!supportedTriggerTypes.includes(trigger.type)) {
            throw new Error(`Unsupported trigger type: ${trigger.type}. Supported types: ${supportedTriggerTypes.join(', ')}`);
        }

        if (!trigger.name || typeof trigger.name !== 'string') {
            throw new Error('Trigger name is required and must be a string');
        }

        // Validate trigger-specific configuration
        switch (trigger.type) {
            case 'WEBHOOK':
                if (!trigger.config || !trigger.config.eventType) {
                    throw new Error('Webhook trigger requires config.eventType');
                }
                break;
            case 'SCHEDULE':
                if (!trigger.config || !trigger.config.schedule) {
                    throw new Error('Schedule trigger requires config.schedule');
                }
                break;
        }
    }

    /**
     * Validate step dependencies and references
     * @param {Array} steps - Array of step configurations
     * @param {Set} stepIds - Set of all step IDs
     * @throws {Error} If dependencies are invalid
     */
    validateStepDependencies(steps, stepIds) {
        for (const step of steps) {
            // Validate nextSteps references
            if (step.nextSteps) {
                for (const nextStepId of step.nextSteps) {
                    if (!stepIds.has(nextStepId)) {
                        throw new Error(`Step "${step.name}": references non-existent next step ID "${nextStepId}"`);
                    }
                }
            }

            // Validate dependencies references
            if (step.dependencies) {
                for (const dependencyName of step.dependencies) {
                    const dependencyExists = steps.some(s => s.name === dependencyName);
                    if (!dependencyExists) {
                        throw new Error(`Step "${step.name}": references non-existent dependency "${dependencyName}"`);
                    }
                }
            }

            // Validate fan-out step dependencies
            if (step.type === 'FAN_OUT' && step.dependsOn) {
                const dependencyExists = steps.some(s => s.name === step.dependsOn);
                if (!dependencyExists) {
                    throw new Error(`Fan-out step "${step.name}": dependsOn references non-existent step "${step.dependsOn}"`);
                }
            }
        }
    }

    /**
     * Check for workflow name conflicts within the integration
     * @param {string} integrationId - Integration ID
     * @param {string} workflowName - Workflow name to check
     * @throws {Error} If name already exists
     */
    async validateWorkflowName(integrationId, workflowName) {
        const existingWorkflows = await this.workflowRepository.findWorkflowsByIntegrationId(integrationId);
        
        const nameExists = existingWorkflows.some(workflow => 
            workflow.name.toLowerCase() === workflowName.toLowerCase() &&
            workflow.status !== 'DISABLED'
        );

        if (nameExists) {
            throw new Error(`Workflow with name "${workflowName}" already exists in this integration`);
        }
    }
}

module.exports = { CreateWorkflow };