/**
 * ExecuteWorkflow Use Case
 * 
 * Initiates workflow execution by creating an execution record and queuing the first step.
 * Handles different trigger types and validates workflow state before execution.
 */
class ExecuteWorkflow {
    /**
     * Creates a new ExecuteWorkflow use case
     * 
     * @param {Object} dependencies - Use case dependencies
     * @param {WorkflowRepository} dependencies.workflowRepository - Workflow repository
     * @param {WorkflowExecutionRepository} dependencies.workflowExecutionRepository - Execution repository
     * @param {Object} dependencies.queueService - Queue service for step execution
     * @param {IntegrationRepository} dependencies.integrationRepository - Integration repository
     * @param {Object} dependencies.logger - Logger instance
     */
    constructor({ 
        workflowRepository, 
        workflowExecutionRepository, 
        queueService, 
        integrationRepository,
        logger = console 
    }) {
        this.workflowRepository = workflowRepository;
        this.workflowExecutionRepository = workflowExecutionRepository;
        this.queueService = queueService;
        this.integrationRepository = integrationRepository;
        this.logger = logger;
    }

    /**
     * Execute a workflow
     * 
     * @param {string} workflowId - ID of the workflow to execute
     * @param {string} triggerType - How the workflow was triggered (MANUAL, WEBHOOK, SCHEDULE, EVENT)
     * @param {Object} triggerData - Data from the trigger (optional)
     * @param {Object} options - Execution options
     * @param {string} options.userId - User ID for permission checking
     * @param {string} options.executionSource - Source of execution (UI, API, etc.)
     * @returns {Promise<WorkflowExecution>} Created execution domain object
     */
    async execute(workflowId, triggerType, triggerData = {}, options = {}) {
        this.logger.log(`Executing workflow ${workflowId} with trigger type ${triggerType}`);

        try {
            // 1. Get and validate workflow
            const workflow = await this.validateAndGetWorkflow(workflowId, options.userId);

            // 2. Validate trigger type against workflow triggers
            this.validateTriggerType(workflow, triggerType);

            // 3. Create execution record
            const execution = await this.createExecutionRecord(workflow, triggerType, triggerData, options);

            // 4. Queue first step for execution
            await this.queueFirstStep(workflow, execution);

            this.logger.log(`Successfully started execution ${execution.id} for workflow ${workflowId}`);
            return execution;

        } catch (error) {
            this.logger.error(`Failed to execute workflow ${workflowId}: ${error.message}`, {
                workflowId,
                triggerType,
                error: error.stack
            });
            throw error;
        }
    }

    /**
     * Resume a paused or stalled workflow execution
     * 
     * @param {string} executionId - ID of the execution to resume
     * @param {string} userId - User ID for permission checking
     * @returns {Promise<WorkflowExecution>} Resumed execution
     */
    async resumeExecution(executionId, userId) {
        this.logger.log(`Resuming workflow execution ${executionId}`);

        try {
            // 1. Get execution and validate
            const execution = await this.workflowExecutionRepository.findById(executionId);
            if (!execution) {
                throw new Error(`Execution ${executionId} not found`);
            }

            if (!execution.isRunning() && execution.status !== 'PAUSED') {
                throw new Error(`Cannot resume execution with status: ${execution.status}`);
            }

            // 2. Get workflow for validation
            const workflow = await this.workflowRepository.findById(execution.workflowId);
            if (!workflow) {
                throw new Error(`Workflow ${execution.workflowId} not found`);
            }

            // 3. Validate user access
            if (userId && workflow.userId !== userId) {
                throw new Error('Access denied to this workflow execution');
            }

            // 4. Find incomplete fan-out steps and resume them
            await this.resumeIncompleteFanOutSteps(execution);

            // 5. Find next step(s) to execute
            const nextSteps = this.findNextStepsToExecute(workflow, execution);

            // 6. Queue next steps
            for (const nextStep of nextSteps) {
                await this.queueStepExecution(execution.id, execution.workflowId, nextStep, execution.context);
            }

            // 7. Update execution status if it was paused
            if (execution.status === 'PAUSED') {
                await this.workflowExecutionRepository.updateExecutionStatus(executionId, 'RUNNING');
                execution.updateStatus('RUNNING');
            }

            this.logger.log(`Successfully resumed execution ${executionId}`);
            return execution;

        } catch (error) {
            this.logger.error(`Failed to resume execution ${executionId}: ${error.message}`, {
                executionId,
                userId,
                error: error.stack
            });
            throw error;
        }
    }

    /**
     * Validate workflow and user access
     * @param {string} workflowId - Workflow ID
     * @param {string} userId - User ID for access validation
     * @returns {Promise<Workflow>} Validated workflow
     */
    async validateAndGetWorkflow(workflowId, userId) {
        const workflow = await this.workflowRepository.findById(workflowId);
        
        if (!workflow) {
            throw new Error(`Workflow ${workflowId} not found`);
        }

        if (!workflow.isExecutable()) {
            throw new Error(`Workflow ${workflowId} is not executable. Status: ${workflow.status}`);
        }

        // Validate user access if userId provided
        if (userId && workflow.userId !== userId) {
            throw new Error('Access denied to this workflow');
        }

        return workflow;
    }

    /**
     * Validate trigger type against workflow configuration
     * @param {Workflow} workflow - Workflow domain object
     * @param {string} triggerType - Trigger type to validate
     */
    validateTriggerType(workflow, triggerType) {
        const supportedTriggers = workflow.getTriggers();
        
        // If no triggers defined, allow manual execution
        if (supportedTriggers.length === 0 && triggerType === 'MANUAL') {
            return;
        }

        // Check if trigger type is supported by workflow
        const triggerSupported = supportedTriggers.some(trigger => trigger.type === triggerType);
        
        if (!triggerSupported) {
            const supportedTypes = supportedTriggers.map(t => t.type).join(', ');
            throw new Error(`Trigger type ${triggerType} not supported. Workflow supports: ${supportedTypes}`);
        }
    }

    /**
     * Create execution record in database
     * @param {Workflow} workflow - Workflow to execute
     * @param {string} triggerType - Trigger type
     * @param {Object} triggerData - Trigger data
     * @param {Object} options - Execution options
     * @returns {Promise<WorkflowExecution>} Created execution
     */
    async createExecutionRecord(workflow, triggerType, triggerData, options) {
        const executionData = {
            workflowId: workflow.id,
            triggerType,
            status: 'RUNNING',
            startTime: new Date(),
            stepExecutions: [],
            context: {
                triggerData,
                stepResults: {},
                variables: {},
                currentStep: null,
                fanOutStates: {}
            },
            metadata: {
                totalSteps: workflow.definition.steps.length,
                completedSteps: 0,
                failedSteps: 0,
                retryCount: 0,
                userId: workflow.userId,
                integrationId: workflow.integrationId,
                executionSource: options.executionSource || 'UNKNOWN',
                parentExecutionId: options.parentExecutionId
            }
        };

        return await this.workflowExecutionRepository.createExecution(executionData);
    }

    /**
     * Queue the first step of the workflow for execution
     * @param {Workflow} workflow - Workflow to execute
     * @param {WorkflowExecution} execution - Execution record
     */
    async queueFirstStep(workflow, execution) {
        const firstStep = workflow.getFirstStep();
        
        if (!firstStep) {
            throw new Error('Workflow has no executable steps');
        }

        await this.queueStepExecution(execution.id, workflow.id, firstStep, execution.context);
    }

    /**
     * Queue a step for execution
     * @param {string} executionId - Execution ID
     * @param {string} workflowId - Workflow ID
     * @param {Object} stepConfig - Step configuration
     * @param {Object} context - Execution context
     */
    async queueStepExecution(executionId, workflowId, stepConfig, context) {
        const queueMessage = {
            type: 'WORKFLOW_STEP_EXECUTION',
            data: {
                executionId,
                workflowId,
                stepId: stepConfig.id,
                stepConfig,
                context: {
                    ...context,
                    executionId,
                    workflowId
                }
            },
            timestamp: new Date().toISOString()
        };

        await this.queueService.queueStepExecution(queueMessage);
    }

    /**
     * Resume incomplete fan-out steps
     * @param {WorkflowExecution} execution - Execution to resume
     */
    async resumeIncompleteFanOutSteps(execution) {
        if (!execution.context.fanOutStates) {
            return;
        }

        for (const [stepId, fanOutState] of Object.entries(execution.context.fanOutStates)) {
            if (fanOutState.status === 'RUNNING') {
                const missingBatches = this.findMissingBatches(fanOutState);
                
                // Re-queue missing batches
                for (const batchIndex of missingBatches) {
                    await this.requeueBatch(execution.id, stepId, batchIndex, fanOutState);
                }
            }
        }
    }

    /**
     * Find missing batches in a fan-out step
     * @param {Object} fanOutState - Fan-out state
     * @returns {Array} Array of missing batch indices
     */
    findMissingBatches(fanOutState) {
        const missingBatches = [];
        
        for (let i = 0; i < fanOutState.totalBatches; i++) {
            if (!fanOutState.batchResults[i]) {
                missingBatches.push(i);
            }
        }
        
        return missingBatches;
    }

    /**
     * Re-queue a missing batch
     * @param {string} executionId - Execution ID
     * @param {string} stepId - Step ID
     * @param {number} batchIndex - Batch index to re-queue
     * @param {Object} fanOutState - Fan-out state
     */
    async requeueBatch(executionId, stepId, batchIndex, fanOutState) {
        const queueMessage = {
            type: 'WORKFLOW_FAN_OUT_STEP',
            data: {
                parentExecutionId: executionId,
                stepId,
                batchIndex,
                stepConfig: fanOutState.stepConfig,
                context: {
                    executionId,
                    batchIndex,
                    totalBatches: fanOutState.totalBatches
                }
            }
        };

        await this.queueService.queueFanOutExecution(queueMessage);
    }

    /**
     * Find next steps to execute after resuming
     * @param {Workflow} workflow - Workflow definition
     * @param {WorkflowExecution} execution - Current execution state
     * @returns {Array} Array of step configurations to execute
     */
    findNextStepsToExecute(workflow, execution) {
        const lastCompletedStep = execution.getLastCompletedStep();
        
        if (!lastCompletedStep) {
            // No completed steps, start from the beginning
            const firstStep = workflow.getFirstStep();
            return firstStep ? [firstStep] : [];
        }

        // Find next steps based on last completed step
        return workflow.getNextSteps(lastCompletedStep.stepId);
    }

    /**
     * Cancel a running workflow execution
     * @param {string} executionId - Execution ID to cancel
     * @param {string} userId - User ID for permission checking
     * @param {string} reason - Cancellation reason
     * @returns {Promise<void>}
     */
    async cancelExecution(executionId, userId, reason = 'User cancelled') {
        this.logger.log(`Cancelling workflow execution ${executionId}`);

        try {
            const execution = await this.workflowExecutionRepository.findById(executionId);
            
            if (!execution) {
                throw new Error(`Execution ${executionId} not found`);
            }

            if (!execution.isRunning()) {
                throw new Error(`Cannot cancel execution with status: ${execution.status}`);
            }

            // Validate user access
            const workflow = await this.workflowRepository.findById(execution.workflowId);
            if (workflow && userId && workflow.userId !== userId) {
                throw new Error('Access denied to this workflow execution');
            }

            // Update execution status
            await this.workflowExecutionRepository.updateExecutionStatus(
                executionId, 
                'CANCELLED', 
                new Date()
            );

            // Log cancellation
            const stepExecution = {
                stepId: 'system',
                stepName: 'cancellation',
                status: 'COMPLETED',
                startTime: new Date(),
                endTime: new Date(),
                result: { reason, cancelledBy: userId },
                error: null
            };

            await this.workflowExecutionRepository.addStepExecution(executionId, stepExecution);

            this.logger.log(`Successfully cancelled execution ${executionId}`);

        } catch (error) {
            this.logger.error(`Failed to cancel execution ${executionId}: ${error.message}`, {
                executionId,
                userId,
                error: error.stack
            });
            throw error;
        }
    }
}

module.exports = { ExecuteWorkflow };