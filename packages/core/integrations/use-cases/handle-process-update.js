const { ProcessUpdateMessage, ProcessUpdateOperation } = require('../domain/process-update-message');

/**
 * Use Case: Handle Process Update from Queue
 *
 * Hexagonal Architecture: Application Layer
 * - Consumes messages from process management queue
 * - Orchestrates state and metrics updates
 * - Delegates to UpdateProcessState and UpdateProcessMetrics use cases
 *
 * DDD: Application Service
 * - Coordinates domain operations
 * - Maintains transaction boundaries
 * - No business logic (delegated to domain use cases)
 *
 * Prevents race conditions by processing messages in FIFO order per process
 */
class HandleProcessUpdate {
    /**
     * Creates a new HandleProcessUpdate use case
     * @param {Object} params - Dependencies
     * @param {Object} params.updateProcessState - UpdateProcessState use case
     * @param {Object} params.updateProcessMetrics - UpdateProcessMetrics use case
     */
    constructor({ updateProcessState, updateProcessMetrics } = {}) {
        if (!updateProcessState) {
            throw new Error('updateProcessState is required');
        }
        if (!updateProcessMetrics) {
            throw new Error('updateProcessMetrics is required');
        }

        this.updateProcessState = updateProcessState;
        this.updateProcessMetrics = updateProcessMetrics;
    }

    /**
     * Handles a process update message
     * @param {ProcessUpdateMessage} message - Update message
     * @returns {Promise<Object>} Updated process
     * @throws {Error} If message is invalid or operation fails
     */
    async execute(message) {
        // Validate message type
        if (!(message instanceof ProcessUpdateMessage)) {
            throw new Error('message must be an instance of ProcessUpdateMessage');
        }

        try {
            console.log(
                `HandleProcessUpdate: Processing ${message.operation} for process ${message.processId}`
            );

            // Route to appropriate handler based on operation type
            switch (message.operation) {
                case ProcessUpdateOperation.UPDATE_STATE:
                    return await this._handleUpdateState(message);

                case ProcessUpdateOperation.UPDATE_METRICS:
                    return await this._handleUpdateMetrics(message);

                case ProcessUpdateOperation.COMPLETE_PROCESS:
                    return await this._handleCompleteProcess(message);

                case ProcessUpdateOperation.HANDLE_ERROR:
                    return await this._handleError(message);

                default:
                    throw new Error(`Unknown operation type: ${message.operation}`);
            }
        } catch (error) {
            console.error(
                `HandleProcessUpdate: Failed to process ${message.operation} for process ${message.processId}:`,
                error
            );
            throw new Error(`Failed to handle process update: ${error.message}`);
        }
    }

    /**
     * Handles UPDATE_STATE operation
     * @param {ProcessUpdateMessage} message - Update message
     * @returns {Promise<Object>} Updated process
     * @private
     */
    async _handleUpdateState(message) {
        const { state, contextUpdates } = message.data;

        return await this.updateProcessState.execute(
            message.processId,
            state,
            contextUpdates
        );
    }

    /**
     * Handles UPDATE_METRICS operation
     * @param {ProcessUpdateMessage} message - Update message
     * @returns {Promise<Object>} Updated process
     * @private
     */
    async _handleUpdateMetrics(message) {
        const { metricsUpdate } = message.data;

        return await this.updateProcessMetrics.execute(
            message.processId,
            metricsUpdate
        );
    }

    /**
     * Handles COMPLETE_PROCESS operation
     * @param {ProcessUpdateMessage} message - Update message
     * @returns {Promise<Object>} Updated process
     * @private
     */
    async _handleCompleteProcess(message) {
        return await this.updateProcessState.execute(
            message.processId,
            'COMPLETED',
            {
                endTime: new Date().toISOString(),
            }
        );
    }

    /**
     * Handles HANDLE_ERROR operation
     * @param {ProcessUpdateMessage} message - Update message
     * @returns {Promise<Object>} Updated process
     * @private
     */
    async _handleError(message) {
        const { error } = message.data;

        return await this.updateProcessState.execute(
            message.processId,
            'ERROR',
            {
                error: error.message,
                errorStack: error.stack,
                errorTimestamp: new Date().toISOString(),
            }
        );
    }

    /**
     * Executes from an SQS message
     * Parses the SQS message body and delegates to execute()
     *
     * @param {Object} sqsMessage - SQS message object
     * @param {string} sqsMessage.body - JSON string message body
     * @returns {Promise<Object>} Updated process
     * @throws {Error} If message parsing or execution fails
     */
    async executeFromSQS(sqsMessage) {
        try {
            // Parse the message body
            const message = ProcessUpdateMessage.fromJSON(sqsMessage.body);

            // Execute the update
            return await this.execute(message);
        } catch (error) {
            console.error('HandleProcessUpdate: Failed to parse SQS message:', error);
            throw error;
        }
    }
}

module.exports = { HandleProcessUpdate };
