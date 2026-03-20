const { QueuerUtil } = require('../queues/queuer-util');

/**
 * WorkflowQueueService
 * 
 * Handles queuing of workflow-related messages using Frigg's existing queue infrastructure.
 * Integrates with AWS SQS through the existing QueuerUtil and queue system.
 */
class WorkflowQueueService {
    /**
     * Creates a new WorkflowQueueService
     * 
     * @param {Object} config - Queue service configuration
     * @param {string} config.queueUrl - SQS queue URL for workflow messages
     * @param {Object} config.logger - Logger instance
     */
    constructor({ queueUrl, logger = console }) {
        this.queueUrl = queueUrl;
        this.logger = logger;
        
        if (!queueUrl) {
            throw new Error('Queue URL is required for WorkflowQueueService');
        }
    }

    /**
     * Queue a step execution message
     * 
     * @param {Object} stepExecutionData - Step execution data
     * @param {string} stepExecutionData.type - Message type (WORKFLOW_STEP_EXECUTION)
     * @param {Object} stepExecutionData.data - Step execution parameters
     * @param {string} stepExecutionData.data.executionId - Execution ID
     * @param {string} stepExecutionData.data.workflowId - Workflow ID
     * @param {string} stepExecutionData.data.stepId - Step ID to execute
     * @param {Object} stepExecutionData.data.stepConfig - Step configuration
     * @param {Object} stepExecutionData.data.context - Execution context
     * @returns {Promise<Object>} SQS response
     */
    async queueStepExecution(stepExecutionData) {
        const messageBody = {
            type: 'WORKFLOW_STEP_EXECUTION',
            data: stepExecutionData.data,
            timestamp: new Date().toISOString(),
            messageId: this.generateMessageId(),
            version: '1.0.0'
        };

        this.logger.log(`Queuing step execution for step ${stepExecutionData.data.stepId} in execution ${stepExecutionData.data.executionId}`);

        try {
            const entries = [messageBody];
            const result = await QueuerUtil.batchSend(entries, this.queueUrl);
            
            this.logger.log(`Successfully queued step execution: ${stepExecutionData.data.stepId}`);
            return result;
            
        } catch (error) {
            this.logger.error(`Failed to queue step execution: ${error.message}`, {
                stepId: stepExecutionData.data.stepId,
                executionId: stepExecutionData.data.executionId,
                error: error.stack
            });
            throw error;
        }
    }

    /**
     * Queue a workflow execution initiation message
     * 
     * @param {Object} workflowExecutionData - Workflow execution data
     * @param {string} workflowExecutionData.workflowId - Workflow ID to execute
     * @param {string} workflowExecutionData.triggerType - Trigger type
     * @param {Object} workflowExecutionData.triggerData - Trigger data
     * @param {Object} workflowExecutionData.options - Execution options
     * @returns {Promise<Object>} SQS response
     */
    async queueWorkflowExecution(workflowExecutionData) {
        const messageBody = {
            type: 'WORKFLOW_EXECUTION',
            data: workflowExecutionData,
            timestamp: new Date().toISOString(),
            messageId: this.generateMessageId(),
            version: '1.0.0'
        };

        this.logger.log(`Queuing workflow execution for workflow ${workflowExecutionData.workflowId}`);

        try {
            const entries = [messageBody];
            const result = await QueuerUtil.batchSend(entries, this.queueUrl);
            
            this.logger.log(`Successfully queued workflow execution: ${workflowExecutionData.workflowId}`);
            return result;
            
        } catch (error) {
            this.logger.error(`Failed to queue workflow execution: ${error.message}`, {
                workflowId: workflowExecutionData.workflowId,
                error: error.stack
            });
            throw error;
        }
    }

    /**
     * Queue fan-out batch executions
     * 
     * @param {Object} fanOutData - Fan-out execution data
     * @param {string} fanOutData.parentExecutionId - Parent execution ID
     * @param {Array} fanOutData.batchData - Array of batch data to process
     * @param {Object} fanOutData.stepConfig - Step configuration
     * @param {Object} fanOutData.context - Execution context
     * @returns {Promise<Object>} SQS response
     */
    async queueFanOutExecution(fanOutData) {
        const { parentExecutionId, batchData, stepConfig, context } = fanOutData;

        this.logger.log(`Queuing fan-out execution with ${Array.isArray(batchData) ? batchData.length : 1} batch(es) for execution ${parentExecutionId}`);

        try {
            let entries = [];

            if (Array.isArray(batchData)) {
                // Multiple batches to queue
                entries = batchData.map((batch, index) => ({
                    type: 'WORKFLOW_FAN_OUT_STEP',
                    data: {
                        parentExecutionId,
                        batchIndex: index,
                        batchData: batch,
                        stepConfig,
                        context: {
                            ...context,
                            batchIndex: index,
                            totalBatches: batchData.length
                        }
                    },
                    timestamp: new Date().toISOString(),
                    messageId: this.generateMessageId(),
                    version: '1.0.0'
                }));
            } else {
                // Single batch (could be pagination or single data processing batch)
                entries = [{
                    type: 'WORKFLOW_FAN_OUT_STEP',
                    data: fanOutData.data || fanOutData,
                    timestamp: new Date().toISOString(),
                    messageId: this.generateMessageId(),
                    version: '1.0.0'
                }];
            }

            const result = await QueuerUtil.batchSend(entries, this.queueUrl);
            
            this.logger.log(`Successfully queued ${entries.length} fan-out batch execution(s) for execution ${parentExecutionId}`);
            return result;
            
        } catch (error) {
            this.logger.error(`Failed to queue fan-out execution: ${error.message}`, {
                parentExecutionId,
                stepId: stepConfig?.id,
                batchCount: Array.isArray(batchData) ? batchData.length : 1,
                error: error.stack
            });
            throw error;
        }
    }

    /**
     * Queue workflow cancellation message
     * 
     * @param {Object} cancellationData - Cancellation data
     * @param {string} cancellationData.executionId - Execution ID to cancel
     * @param {string} cancellationData.reason - Cancellation reason
     * @param {string} cancellationData.userId - User ID who cancelled
     * @returns {Promise<Object>} SQS response
     */
    async queueWorkflowCancellation(cancellationData) {
        const messageBody = {
            type: 'WORKFLOW_CANCELLATION',
            data: cancellationData,
            timestamp: new Date().toISOString(),
            messageId: this.generateMessageId(),
            version: '1.0.0'
        };

        this.logger.log(`Queuing workflow cancellation for execution ${cancellationData.executionId}`);

        try {
            const entries = [messageBody];
            const result = await QueuerUtil.batchSend(entries, this.queueUrl);
            
            this.logger.log(`Successfully queued workflow cancellation: ${cancellationData.executionId}`);
            return result;
            
        } catch (error) {
            this.logger.error(`Failed to queue workflow cancellation: ${error.message}`, {
                executionId: cancellationData.executionId,
                error: error.stack
            });
            throw error;
        }
    }

    /**
     * Queue workflow resumption message
     * 
     * @param {Object} resumeData - Resume data
     * @param {string} resumeData.executionId - Execution ID to resume
     * @param {string} resumeData.userId - User ID who requested resume
     * @returns {Promise<Object>} SQS response
     */
    async queueWorkflowResume(resumeData) {
        const messageBody = {
            type: 'WORKFLOW_RESUME',
            data: resumeData,
            timestamp: new Date().toISOString(),
            messageId: this.generateMessageId(),
            version: '1.0.0'
        };

        this.logger.log(`Queuing workflow resume for execution ${resumeData.executionId}`);

        try {
            const entries = [messageBody];
            const result = await QueuerUtil.batchSend(entries, this.queueUrl);
            
            this.logger.log(`Successfully queued workflow resume: ${resumeData.executionId}`);
            return result;
            
        } catch (error) {
            this.logger.error(`Failed to queue workflow resume: ${error.message}`, {
                executionId: resumeData.executionId,
                error: error.stack
            });
            throw error;
        }
    }

    /**
     * Queue multiple messages efficiently
     * 
     * @param {Array} messages - Array of message objects
     * @returns {Promise<Object>} SQS response
     */
    async queueBatch(messages) {
        if (!Array.isArray(messages) || messages.length === 0) {
            throw new Error('Messages array is required and must not be empty');
        }

        this.logger.log(`Queuing batch of ${messages.length} workflow messages`);

        try {
            const entries = messages.map(message => ({
                ...message,
                timestamp: message.timestamp || new Date().toISOString(),
                messageId: message.messageId || this.generateMessageId(),
                version: message.version || '1.0.0'
            }));

            const result = await QueuerUtil.batchSend(entries, this.queueUrl);
            
            this.logger.log(`Successfully queued batch of ${entries.length} workflow messages`);
            return result;
            
        } catch (error) {
            this.logger.error(`Failed to queue message batch: ${error.message}`, {
                messageCount: messages.length,
                error: error.stack
            });
            throw error;
        }
    }

    /**
     * Get queue metrics and status
     * 
     * @returns {Promise<Object>} Queue status information
     */
    async getQueueStatus() {
        // In a real implementation, this would query SQS for queue attributes
        return {
            queueUrl: this.queueUrl,
            status: 'active',
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Generate unique message ID
     * @returns {string} Unique message ID
     */
    generateMessageId() {
        return `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Validate message format
     * @param {Object} message - Message to validate
     * @throws {Error} If message format is invalid
     */
    validateMessage(message) {
        if (!message.type) {
            throw new Error('Message type is required');
        }

        if (!message.data) {
            throw new Error('Message data is required');
        }

        const supportedTypes = [
            'WORKFLOW_STEP_EXECUTION',
            'WORKFLOW_EXECUTION', 
            'WORKFLOW_FAN_OUT_STEP',
            'WORKFLOW_CANCELLATION',
            'WORKFLOW_RESUME'
        ];

        if (!supportedTypes.includes(message.type)) {
            throw new Error(`Unsupported message type: ${message.type}`);
        }

        // Type-specific validation
        switch (message.type) {
            case 'WORKFLOW_STEP_EXECUTION':
                this.validateStepExecutionMessage(message.data);
                break;
            case 'WORKFLOW_EXECUTION':
                this.validateWorkflowExecutionMessage(message.data);
                break;
            case 'WORKFLOW_FAN_OUT_STEP':
                this.validateFanOutMessage(message.data);
                break;
        }
    }

    /**
     * Validate step execution message data
     * @param {Object} data - Message data
     * @throws {Error} If data is invalid
     */
    validateStepExecutionMessage(data) {
        const required = ['executionId', 'workflowId', 'stepId', 'stepConfig'];
        for (const field of required) {
            if (!data[field]) {
                throw new Error(`Step execution message missing required field: ${field}`);
            }
        }
    }

    /**
     * Validate workflow execution message data
     * @param {Object} data - Message data
     * @throws {Error} If data is invalid
     */
    validateWorkflowExecutionMessage(data) {
        const required = ['workflowId', 'triggerType'];
        for (const field of required) {
            if (!data[field]) {
                throw new Error(`Workflow execution message missing required field: ${field}`);
            }
        }
    }

    /**
     * Validate fan-out message data
     * @param {Object} data - Message data
     * @throws {Error} If data is invalid
     */
    validateFanOutMessage(data) {
        const required = ['parentExecutionId', 'stepConfig'];
        for (const field of required) {
            if (!data[field]) {
                throw new Error(`Fan-out message missing required field: ${field}`);
            }
        }
    }
}

module.exports = { WorkflowQueueService };