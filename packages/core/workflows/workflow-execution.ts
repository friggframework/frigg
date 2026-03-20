/**
 * WorkflowExecution Domain Object
 * 
 * Represents a single execution instance of a workflow with its runtime state,
 * step execution history, and context variables.
 */
class WorkflowExecution {
    /**
     * Creates a new WorkflowExecution domain object
     * 
     * @param {Object} params - WorkflowExecution parameters
     * @param {string} params.id - Unique execution identifier
     * @param {string} params.workflowId - ID of the workflow being executed
     * @param {string} params.triggerType - How the workflow was triggered (MANUAL, WEBHOOK, SCHEDULE, EVENT)
     * @param {string} params.status - Execution status (RUNNING, COMPLETED, FAILED, PAUSED)
     * @param {Date} params.startTime - When execution started
     * @param {Date} params.endTime - When execution completed (null if still running)
     * @param {Array} params.stepExecutions - Array of step execution results
     * @param {Object} params.context - Execution context and variables
     */
    constructor({ id, workflowId, triggerType, status, startTime, endTime, stepExecutions, context }) {
        this.id = id;
        this.workflowId = workflowId;
        this.triggerType = triggerType; // 'MANUAL', 'WEBHOOK', 'SCHEDULE', 'EVENT'
        this.status = status || 'RUNNING'; // 'RUNNING', 'COMPLETED', 'FAILED', 'PAUSED'
        this.startTime = startTime || new Date();
        this.endTime = endTime;
        this.stepExecutions = stepExecutions || [];
        this.context = context || {
            triggerData: {},
            stepResults: {},
            variables: {},
            currentStep: null,
            fanOutStates: {}
        };
        this.fanOutState = new Map(); // Track fan-out step progress
    }

    /**
     * Add a completed step execution to the history
     * @param {Object} stepExecution - Step execution result
     */
    addStepExecution(stepExecution) {
        this.stepExecutions.push({
            ...stepExecution,
            timestamp: new Date()
        });
        
        // Update context with step result
        if (stepExecution.result && stepExecution.stepName) {
            this.context.stepResults[stepExecution.stepName] = stepExecution.result;
        }
        
        this.context.currentStep = stepExecution.stepId;
    }

    /**
     * Add fan-out batch result and check for completion
     * @param {string} stepId - Step ID for the fan-out
     * @param {number} batchIndex - Index of the completed batch
     * @param {Object} result - Result from the batch execution
     * @param {number} totalBatches - Total number of batches expected
     * @returns {boolean} True if all batches are complete
     */
    addFanOutResult(stepId, batchIndex, result, totalBatches) {
        if (!this.fanOutState.has(stepId)) {
            this.fanOutState.set(stepId, {
                completedBatches: 0,
                totalBatches: totalBatches || 1,
                results: [],
                aggregatedResult: null,
                status: 'RUNNING',
                startTime: new Date()
            });
        }
        
        const stepState = this.fanOutState.get(stepId);
        stepState.results[batchIndex] = result;
        stepState.completedBatches++;
        
        // Check if all batches are complete
        if (stepState.completedBatches === stepState.totalBatches) {
            stepState.aggregatedResult = this.aggregateFanOutResults(stepState.results);
            stepState.status = 'COMPLETED';
            stepState.endTime = new Date();
            return true; // All batches complete
        }
        
        return false; // Still waiting for more batches
    }

    /**
     * Aggregate results from all fan-out batches
     * @param {Array} batchResults - Array of batch execution results
     * @returns {Object} Aggregated result
     */
    aggregateFanOutResults(batchResults) {
        const validResults = batchResults.filter(Boolean);
        
        return {
            totalBatches: batchResults.length,
            successfulBatches: validResults.filter(r => r.status !== 'error').length,
            failedBatches: validResults.filter(r => r.status === 'error').length,
            totalProcessed: validResults.reduce((sum, batch) => sum + (batch.processedCount || 0), 0),
            totalErrors: validResults.reduce((sum, batch) => sum + (batch.errorCount || 0), 0),
            batchResults: validResults,
            completedAt: new Date()
        };
    }

    /**
     * Update execution status
     * @param {string} newStatus - New status to set
     * @param {Date} endTime - Optional end time for completion
     */
    updateStatus(newStatus, endTime = null) {
        this.status = newStatus;
        if (endTime) {
            this.endTime = endTime;
        }
        
        if (newStatus === 'COMPLETED' || newStatus === 'FAILED') {
            this.endTime = this.endTime || new Date();
        }
    }

    /**
     * Get the last completed step execution
     * @returns {Object|null} Last completed step execution
     */
    getLastCompletedStep() {
        const completedSteps = this.stepExecutions.filter(step => step.status === 'COMPLETED');
        return completedSteps.length > 0 ? completedSteps[completedSteps.length - 1] : null;
    }

    /**
     * Get execution duration in milliseconds
     * @returns {number} Duration in milliseconds
     */
    getDuration() {
        const endTime = this.endTime || new Date();
        return endTime.getTime() - this.startTime.getTime();
    }

    /**
     * Check if execution is currently running
     * @returns {boolean} True if execution is running
     */
    isRunning() {
        return this.status === 'RUNNING';
    }

    /**
     * Check if execution has completed successfully
     * @returns {boolean} True if execution completed successfully
     */
    isCompleted() {
        return this.status === 'COMPLETED';
    }

    /**
     * Check if execution has failed
     * @returns {boolean} True if execution failed
     */
    isFailed() {
        return this.status === 'FAILED';
    }

    /**
     * Get execution progress summary
     * @returns {Object} Progress summary
     */
    getProgress() {
        const totalSteps = this.stepExecutions.length;
        const completedSteps = this.stepExecutions.filter(step => step.status === 'COMPLETED').length;
        const failedSteps = this.stepExecutions.filter(step => step.status === 'FAILED').length;
        
        return {
            totalSteps,
            completedSteps,
            failedSteps,
            percentage: totalSteps > 0 ? (completedSteps / totalSteps) * 100 : 0,
            duration: this.getDuration(),
            status: this.status,
            currentStep: this.context.currentStep
        };
    }

    /**
     * Get execution summary for monitoring
     * @returns {Object} Execution summary
     */
    getSummary() {
        return {
            id: this.id,
            workflowId: this.workflowId,
            triggerType: this.triggerType,
            status: this.status,
            startTime: this.startTime,
            endTime: this.endTime,
            duration: this.getDuration(),
            progress: this.getProgress(),
            stepCount: this.stepExecutions.length,
            fanOutSteps: Array.from(this.fanOutState.keys())
        };
    }
}

module.exports = { WorkflowExecution };