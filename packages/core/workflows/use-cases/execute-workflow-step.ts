const { StepFactory } = require('../steps');

/**
 * ExecuteWorkflowStep Use Case
 * 
 * Executes individual workflow steps including function steps, request steps,
 * conditional steps, and fan-out steps. Handles step result processing and
 * queuing of subsequent steps.
 */
class ExecuteWorkflowStep {
    /**
     * Creates a new ExecuteWorkflowStep use case
     * 
     * @param {Object} dependencies - Use case dependencies
     * @param {WorkflowExecutionRepository} dependencies.workflowExecutionRepository - Execution repository
     * @param {IntegrationRepository} dependencies.integrationRepository - Integration repository
     * @param {Object} dependencies.queueService - Queue service for next steps
     * @param {Object} dependencies.logger - Logger instance
     */
    constructor({ 
        workflowExecutionRepository, 
        integrationRepository, 
        queueService,
        logger = console 
    }) {
        this.workflowExecutionRepository = workflowExecutionRepository;
        this.integrationRepository = integrationRepository;
        this.queueService = queueService;
        this.logger = logger;
    }

    /**
     * Execute a workflow step
     * 
     * @param {Object} params - Step execution parameters
     * @param {string} params.executionId - Execution ID
     * @param {string} params.workflowId - Workflow ID
     * @param {string} params.stepId - Step ID to execute
     * @param {Object} params.stepConfig - Step configuration
     * @param {Object} params.context - Execution context
     * @returns {Promise<Object>} Step execution result
     */
    async execute({ executionId, workflowId, stepId, stepConfig, context }) {
        this.logger.log(`Executing step ${stepId} (${stepConfig.name}) for execution ${executionId}`);

        const startTime = new Date();
        let stepExecution = null;

        try {
            // 1. Load current execution state
            const execution = await this.workflowExecutionRepository.findById(executionId);
            if (!execution) {
                throw new Error(`Execution ${executionId} not found`);
            }

            if (!execution.isRunning()) {
                throw new Error(`Cannot execute step for non-running execution (status: ${execution.status})`);
            }

            // 2. Update current step context
            await this.workflowExecutionRepository.updateExecutionContext(executionId, {
                ...execution.context,
                currentStep: stepId
            });

            // 3. Execute step based on type
            let result;
            switch (stepConfig.type) {
                case 'FUNCTION':
                    result = await this.executeFunctionStep(workflowId, stepConfig, context);
                    break;
                case 'FAN_OUT':
                    result = await this.executeFanOutStep(executionId, stepConfig, context);
                    break;
                default:
                    throw new Error(`Unknown step type: ${stepConfig.type}`);
            }

            // 4. Record successful step execution
            stepExecution = {
                stepId,
                stepName: stepConfig.name,
                status: 'COMPLETED',
                startTime,
                endTime: new Date(),
                result,
                error: null
            };

            await this.recordStepExecution(executionId, stepExecution);

            // 5. Update context with step result (except for fan-out which handles this differently)
            if (stepConfig.type !== 'FAN_OUT') {
                await this.updateStepResult(executionId, stepConfig.name, result);
                
                // 6. Queue next steps
                await this.queueNextSteps(stepConfig, executionId, workflowId, {
                    ...context,
                    [stepConfig.name]: result
                });
            }

            this.logger.log(`Successfully executed step ${stepId} for execution ${executionId}`);
            return result;

        } catch (error) {
            // Handle step failure
            const endTime = new Date();
            stepExecution = {
                stepId,
                stepName: stepConfig.name,
                status: 'FAILED',
                startTime,
                endTime,
                result: null,
                error: {
                    message: error.message,
                    stack: error.stack,
                    code: error.code,
                    timestamp: endTime
                }
            };

            await this.handleStepFailure(executionId, stepExecution, stepConfig, context);
            throw error;
        }
    }

    /**
     * Execute a function step by calling integration method
     * @param {string} workflowId - Workflow ID to get integration instance
     * @param {Object} stepConfig - Function step configuration
     * @param {Object} context - Execution context
     * @returns {Promise<Object>} Step execution result
     */
    async executeFunctionStep(workflowId, stepConfig, context) {
        // Get integration instance for the workflow
        const integration = await this.getIntegrationInstance(workflowId);
        
        // Get the handler method
        const handler = integration[stepConfig.handler];
        if (!handler || typeof handler !== 'function') {
            throw new Error(`Handler method ${stepConfig.handler} not found on integration`);
        }

        // Create step instance for additional validation and context processing
        const functionStep = StepFactory.createStep(stepConfig);
        const executionContext = functionStep.getExecutionContext({ stepResults: context });

        // Execute handler with proper binding and context
        this.logger.log(`Calling handler ${stepConfig.handler} on integration`);
        const result = await handler.call(integration, executionContext);

        return {
            data: result,
            executedAt: new Date(),
            handler: stepConfig.handler,
            duration: functionStep.timeout
        };
    }


    /**
     * Execute a fan-out step by creating batch executions
     * @param {string} executionId - Parent execution ID
     * @param {Object} stepConfig - Fan-out step configuration
     * @param {Object} context - Execution context
     * @returns {Promise<Object>} Fan-out coordination result
     */
    async executeFanOutStep(executionId, stepConfig, context) {
        const fanOutStep = StepFactory.createStep(stepConfig);
        
        this.logger.log(`Starting fan-out step ${stepConfig.name} of type ${stepConfig.fanOutType}`);

        // Create batch configuration based on fan-out type
        const batchConfig = fanOutStep.createBatchConfiguration({ 
            stepResults: context,
            executionId
        });

        if (batchConfig.totalBatches === 0) {
            this.logger.warn(`No batches to process for fan-out step ${stepConfig.name}`);
            return {
                totalBatches: 0,
                fanOutType: stepConfig.fanOutType,
                status: 'NO_DATA',
                executedAt: new Date()
            };
        }

        // Initialize fan-out state
        const fanOutState = {
            stepId: stepConfig.id,
            stepName: stepConfig.name,
            totalBatches: batchConfig.totalBatches,
            completedBatches: 0,
            batchResults: new Array(batchConfig.totalBatches),
            aggregatedResult: null,
            status: 'RUNNING',
            fanOutType: stepConfig.fanOutType,
            stepConfig
        };

        await this.workflowExecutionRepository.initializeFanOutState(
            executionId, 
            stepConfig.id, 
            fanOutState
        );

        // Queue batch executions
        if (fanOutStep.shouldBatchQueue(batchConfig.totalBatches)) {
            // Large fan-out: queue in smaller groups to avoid overwhelming the system
            const queueBatches = fanOutStep.createQueueBatches(batchConfig.batchConfigs);
            
            for (const queueBatch of queueBatches) {
                await this.queueBatchGroup(executionId, stepConfig, queueBatch, context);
            }
        } else {
            // Small fan-out: queue all batches at once
            await this.queueAllBatches(executionId, stepConfig, batchConfig.batchConfigs, context);
        }

        this.logger.log(`Queued ${batchConfig.totalBatches} batches for fan-out step ${stepConfig.name}`);

        return {
            totalBatches: batchConfig.totalBatches,
            fanOutType: stepConfig.fanOutType,
            status: 'BATCHES_QUEUED',
            executedAt: new Date()
        };
    }

    /**
     * Queue a group of batches for execution
     * @param {string} executionId - Parent execution ID
     * @param {Object} stepConfig - Step configuration
     * @param {Array} batchGroup - Group of batch configurations
     * @param {Object} context - Execution context
     */
    async queueBatchGroup(executionId, stepConfig, batchGroup, context) {
        const queuePromises = batchGroup.map(batchConfig => 
            this.queueSingleBatch(executionId, stepConfig, batchConfig, context)
        );

        await Promise.all(queuePromises);
    }

    /**
     * Queue all batches for execution
     * @param {string} executionId - Parent execution ID
     * @param {Object} stepConfig - Step configuration
     * @param {Array} batchConfigs - All batch configurations
     * @param {Object} context - Execution context
     */
    async queueAllBatches(executionId, stepConfig, batchConfigs, context) {
        const queuePromises = batchConfigs.map(batchConfig => 
            this.queueSingleBatch(executionId, stepConfig, batchConfig, context)
        );

        await Promise.all(queuePromises);
    }

    /**
     * Queue a single batch for execution
     * @param {string} executionId - Parent execution ID
     * @param {Object} stepConfig - Step configuration
     * @param {Object} batchConfig - Batch configuration
     * @param {Object} context - Execution context
     */
    async queueSingleBatch(executionId, stepConfig, batchConfig, context) {
        const queueMessage = {
            type: 'WORKFLOW_FAN_OUT_STEP',
            data: {
                parentExecutionId: executionId,
                stepId: stepConfig.id,
                batchIndex: batchConfig.batchIndex,
                stepConfig,
                context: {
                    ...context,
                    workflowId: context.workflowId,
                    batchIndex: batchConfig.batchIndex,
                    batchData: batchConfig.batchData,
                    totalBatches: batchConfig.totalBatches
                }
            }
        };

        await this.queueService.queueFanOutExecution(queueMessage);
    }

    /**
     * Get integration instance for workflow execution
     * @param {string} workflowId - Workflow ID
     * @returns {Promise<Object>} Integration instance
     */
    async getIntegrationInstance(workflowId) {
        // This would typically involve getting the integration from the workflow
        // and creating/loading the integration instance with proper credentials
        return await this.integrationRepository.getIntegrationInstanceByWorkflowId(workflowId);
    }

    /**
     * Record step execution in the database
     * @param {string} executionId - Execution ID
     * @param {Object} stepExecution - Step execution result
     */
    async recordStepExecution(executionId, stepExecution) {
        await this.workflowExecutionRepository.addStepExecution(executionId, stepExecution);
    }

    /**
     * Update step result in execution context
     * @param {string} executionId - Execution ID
     * @param {string} stepName - Step name
     * @param {Object} result - Step result
     */
    async updateStepResult(executionId, stepName, result) {
        await this.workflowExecutionRepository.updateStepResult(executionId, stepName, result);
    }

    /**
     * Queue next steps for execution
     * @param {Object} stepConfig - Current step configuration
     * @param {string} executionId - Execution ID
     * @param {string} workflowId - Workflow ID
     * @param {Object} context - Updated execution context
     */
    async queueNextSteps(stepConfig, executionId, workflowId, context) {
        if (!stepConfig.nextSteps || stepConfig.nextSteps.length === 0) {
            // No next steps - check if this is the end of the workflow
            await this.checkWorkflowCompletion(executionId);
            return;
        }

        // Queue each next step
        for (const nextStepId of stepConfig.nextSteps) {
            await this.queueStepExecution(executionId, workflowId, nextStepId, context);
        }
    }

    /**
     * Queue a step for execution
     * @param {string} executionId - Execution ID
     * @param {string} workflowId - Workflow ID
     * @param {string} stepId - Step ID to queue
     * @param {Object} context - Execution context
     */
    async queueStepExecution(executionId, workflowId, stepId, context) {
        const queueMessage = {
            type: 'WORKFLOW_STEP_EXECUTION',
            data: {
                executionId,
                workflowId,
                stepId,
                context
            }
        };

        await this.queueService.queueStepExecution(queueMessage);
    }

    /**
     * Handle step execution failure
     * @param {string} executionId - Execution ID
     * @param {Object} stepExecution - Failed step execution
     * @param {Object} stepConfig - Step configuration
     * @param {Object} context - Execution context
     */
    async handleStepFailure(executionId, stepExecution, stepConfig, context) {
        this.logger.error(`Step ${stepConfig.name} failed for execution ${executionId}: ${stepExecution.error.message}`);

        // Record the failed step execution
        await this.recordStepExecution(executionId, stepExecution);

        // Check retry policy for function steps
        if (stepConfig.type === 'FUNCTION' && stepConfig.retryPolicy) {
            const retryCount = await this.getStepRetryCount(executionId, stepConfig.id);
            const functionStep = StepFactory.createStep(stepConfig);
            
            if (functionStep.shouldRetry(new Error(stepExecution.error.message), retryCount)) {
                await this.scheduleStepRetry(executionId, stepConfig, context, retryCount);
                return;
            }
        }

        // Mark execution as failed if no retry
        await this.workflowExecutionRepository.updateExecutionStatus(
            executionId, 
            'FAILED', 
            new Date()
        );

        this.logger.error(`Workflow execution ${executionId} marked as failed due to step failure`);
    }

    /**
     * Get retry count for a specific step
     * @param {string} executionId - Execution ID
     * @param {string} stepId - Step ID
     * @returns {Promise<number>} Number of retries attempted
     */
    async getStepRetryCount(executionId, stepId) {
        const execution = await this.workflowExecutionRepository.findById(executionId);
        if (!execution) return 0;

        return execution.stepExecutions.filter(step => 
            step.stepId === stepId && step.status === 'FAILED'
        ).length;
    }

    /**
     * Schedule a step retry with delay
     * @param {string} executionId - Execution ID
     * @param {Object} stepConfig - Step configuration
     * @param {Object} context - Execution context
     * @param {number} retryCount - Current retry count
     */
    async scheduleStepRetry(executionId, stepConfig, context, retryCount) {
        const functionStep = StepFactory.createStep(stepConfig);
        const delay = functionStep.calculateRetryDelay(retryCount);

        this.logger.log(`Scheduling retry for step ${stepConfig.name} in ${delay}ms (attempt ${retryCount + 1})`);

        // In a real implementation, this might use a delayed queue or scheduler
        setTimeout(async () => {
            try {
                await this.queueStepExecution(executionId, context.workflowId, stepConfig.id, context);
            } catch (error) {
                this.logger.error(`Failed to queue retry for step ${stepConfig.name}: ${error.message}`);
            }
        }, delay);
    }

    /**
     * Check if workflow execution is complete
     * @param {string} executionId - Execution ID
     */
    async checkWorkflowCompletion(executionId) {
        const execution = await this.workflowExecutionRepository.findById(executionId);
        if (!execution) return;

        // Check if all fan-out steps are completed
        if (execution.context.fanOutStates) {
            const pendingFanOuts = Object.values(execution.context.fanOutStates)
                .filter(state => state.status === 'RUNNING');
            
            if (pendingFanOuts.length > 0) {
                this.logger.log(`Workflow ${executionId} waiting for ${pendingFanOuts.length} fan-out steps to complete`);
                return;
            }
        }

        // Mark workflow as completed
        await this.workflowExecutionRepository.updateExecutionStatus(
            executionId, 
            'COMPLETED', 
            new Date()
        );

        this.logger.log(`Workflow execution ${executionId} completed successfully`);
    }

}

module.exports = { ExecuteWorkflowStep };