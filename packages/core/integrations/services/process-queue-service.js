const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const { ProcessUpdateMessage, ProcessUpdateOperation } = require('../domain/process-update-message');

/**
 * Gets AWS configuration based on environment
 * @returns {Object} AWS SDK configuration
 */
const getAWSConfig = () => {
    const config = {};
    if (process.env.IS_OFFLINE) {
        console.log('ProcessQueueService: Running in offline mode');
        config.credentials = {
            accessKeyId: 'test-aws-key',
            secretAccessKey: 'test-aws-secret',
        };
        config.region = 'us-east-1';
    }
    if (process.env.AWS_ENDPOINT) {
        config.endpoint = process.env.AWS_ENDPOINT;
    }
    return config;
};

/**
 * Domain Service for managing process updates via FIFO queue
 *
 * Hexagonal Architecture: Domain Service (Port)
 * - Orchestrates process update operations
 * - Uses SQS adapter (infrastructure)
 * - Prevents race conditions via FIFO queue ordering
 *
 * Key Features:
 * - Single FIFO queue for all processes
 * - MessageGroupId ensures ordered processing per process
 * - MessageDeduplicationId prevents duplicate messages
 */
class ProcessQueueService {
    /**
     * Creates a new ProcessQueueService
     * @param {Object} params - Service parameters
     * @param {string} params.queueUrl - FIFO queue URL
     * @throws {Error} If queueUrl is invalid
     */
    constructor({ queueUrl } = {}) {
        // Validate queueUrl
        if (!queueUrl) {
            throw new Error('queueUrl is required');
        }
        if (typeof queueUrl !== 'string') {
            throw new Error('queueUrl must be a string');
        }

        this.queueUrl = queueUrl;
        this.sqsClient = new SQSClient(getAWSConfig());
    }

    /**
     * Sends a ProcessUpdateMessage to the queue
     * @param {ProcessUpdateMessage} message - Message to send
     * @returns {Promise<Object>} SQS response
     * @throws {Error} If message is invalid or send fails
     */
    async sendMessage(message) {
        // Validate message type
        if (!(message instanceof ProcessUpdateMessage)) {
            throw new Error('message must be an instance of ProcessUpdateMessage');
        }

        try {
            const command = new SendMessageCommand({
                QueueUrl: this.queueUrl,
                MessageBody: JSON.stringify(message.toJSON()),
                MessageGroupId: message.getMessageGroupId(),
                MessageDeduplicationId: message.getMessageDeduplicationId(),
            });

            console.log(
                `ProcessQueueService: Sending ${message.operation} for process ${message.processId}`
            );

            return await this.sqsClient.send(command);
        } catch (error) {
            throw new Error(`Failed to send message to queue: ${error.message}`);
        }
    }

    /**
     * Queues a process state update
     * @param {string} processId - Process ID
     * @param {string} state - New state
     * @param {Object} [contextUpdates={}] - Context updates
     * @returns {Promise<Object>} SQS response
     */
    async queueStateUpdate(processId, state, contextUpdates = {}) {
        // Validate inputs
        if (!state || typeof state !== 'string') {
            throw new Error('state is required');
        }

        const message = new ProcessUpdateMessage({
            processId,
            operation: ProcessUpdateOperation.UPDATE_STATE,
            data: {
                state,
                contextUpdates: contextUpdates || {},
            },
        });

        return this.sendMessage(message);
    }

    /**
     * Queues a process metrics update
     * @param {string} processId - Process ID
     * @param {Object} metricsUpdate - Metrics to update
     * @returns {Promise<Object>} SQS response
     */
    async queueMetricsUpdate(processId, metricsUpdate) {
        // Validate inputs
        if (!metricsUpdate || typeof metricsUpdate !== 'object') {
            throw new Error('metricsUpdate is required');
        }

        const message = new ProcessUpdateMessage({
            processId,
            operation: ProcessUpdateOperation.UPDATE_METRICS,
            data: {
                metricsUpdate,
            },
        });

        return this.sendMessage(message);
    }

    /**
     * Queues process completion
     * @param {string} processId - Process ID
     * @returns {Promise<Object>} SQS response
     */
    async queueProcessCompletion(processId) {
        const message = new ProcessUpdateMessage({
            processId,
            operation: ProcessUpdateOperation.COMPLETE_PROCESS,
            data: {},
        });

        return this.sendMessage(message);
    }

    /**
     * Queues error handling
     * @param {string} processId - Process ID
     * @param {Error} error - Error object
     * @returns {Promise<Object>} SQS response
     */
    async queueErrorHandling(processId, error) {
        // Validate error
        if (!(error instanceof Error)) {
            throw new Error('error must be an Error object');
        }

        const message = new ProcessUpdateMessage({
            processId,
            operation: ProcessUpdateOperation.HANDLE_ERROR,
            data: {
                error: {
                    message: error.message,
                    stack: error.stack,
                },
            },
        });

        return this.sendMessage(message);
    }
}

module.exports = { ProcessQueueService };
