const { ProcessQueueService } = require('../../integrations/services/process-queue-service');

/**
 * Checks if the process queue is enabled
 * @returns {boolean} True if enabled
 */
function isQueueEnabled() {
    const enabled = process.env.PROCESS_QUEUE_ENABLED;
    return enabled ? enabled.toLowerCase() === 'true' : false;
}

/**
 * Gets or creates the ProcessQueueService singleton instance
 * @returns {ProcessQueueService|null} Queue service instance or null if disabled
 * @throws {Error} If queue is enabled but PROCESS_MANAGEMENT_QUEUE_URL is not set
 */
let queueServiceInstance = null;

function getQueueService() {
    if (!isQueueEnabled()) {
        return null;
    }

    if (!queueServiceInstance) {
        const queueUrl = process.env.PROCESS_MANAGEMENT_QUEUE_URL;

        if (!queueUrl) {
            throw new Error(
                'PROCESS_MANAGEMENT_QUEUE_URL environment variable is required when PROCESS_QUEUE_ENABLED=true'
            );
        }

        queueServiceInstance = new ProcessQueueService({ queueUrl });
    }

    return queueServiceInstance;
}

/**
 * Create process command factory
 *
 * Process commands manage process state transitions via a FIFO queue to prevent
 * race conditions when multiple workers update the same process concurrently.
 *
 * State Machine Concept:
 * - Each command triggers a state transition or metrics update
 * - Queue ensures ordered processing per process (FIFO)
 * - Prevents lost updates from concurrent workers
 *
 * @returns {Object} Process command object with queue operations
 *
 * @example
 * const commands = createProcessCommands();
 *
 * // Queue state update (triggers state transition)
 * await commands.queueStateUpdate(processId, 'RUNNING', { step: 1 });
 *
 * // Queue metrics update (accumulative)
 * await commands.queueMetricsUpdate(processId, { totalProcessed: 100 });
 *
 * // Queue completion (terminal state)
 * await commands.queueCompletion(processId);
 *
 * // Queue error (terminal state)
 * await commands.queueError(processId, error);
 */
function createProcessCommands() {
    return {
        /**
         * Check if process queue is enabled
         * @returns {boolean} True if enabled
         *
         * @example
         * if (commands.isQueueEnabled()) {
         *   await commands.queueStateUpdate(processId, 'RUNNING');
         * }
         */
        isQueueEnabled,

        /**
         * Queue a process state update
         *
         * State Machine Event: Triggers state transition
         * - Validates transition is allowed (via HandleProcessUpdate)
         * - Updates process.state and process.context
         * - Ordered processing ensures consistency
         *
         * @param {string} processId - Process ID
         * @param {string} state - New state (e.g., 'RUNNING', 'PAUSED', 'COMPLETED')
         * @param {Object} [contextUpdates={}] - Context updates to merge
         * @returns {Promise<Object|null>} SQS response or null if queue disabled
         *
         * @example
         * // Transition to RUNNING state with context
         * await commands.queueStateUpdate(processId, 'RUNNING', {
         *   currentBatch: 'batch-123',
         *   step: 2,
         *   lastProcessedId: 'record-456'
         * });
         *
         * @example
         * // Transition to PAUSED state
         * await commands.queueStateUpdate(processId, 'PAUSED', {
         *   pausedAt: new Date().toISOString(),
         *   pauseReason: 'Rate limit reached'
         * });
         */
        async queueStateUpdate(processId, state, contextUpdates = {}) {
            const queueService = getQueueService();
            if (!queueService) {
                return null; // Queue disabled
            }

            return await queueService.queueStateUpdate(processId, state, contextUpdates);
        },

        /**
         * Queue a process metrics update
         *
         * State Machine Event: Updates metrics without changing state
         * - Accumulates metrics (adds to existing values)
         * - Calculates performance stats (duration, rate, ETA)
         * - Appends errors to error log
         *
         * @param {string} processId - Process ID
         * @param {Object} metricsUpdate - Metrics to add (cumulative)
         * @param {number} [metricsUpdate.totalProcessed] - Records processed (added to total)
         * @param {number} [metricsUpdate.totalFailed] - Records failed (added to total)
         * @param {number} [metricsUpdate.totalSkipped] - Records skipped (added to total)
         * @param {Array} [metricsUpdate.errors] - Error details to append
         * @returns {Promise<Object|null>} SQS response or null if queue disabled
         *
         * @example
         * // Update metrics after processing a batch
         * await commands.queueMetricsUpdate(processId, {
         *   totalProcessed: 50,
         *   totalFailed: 2,
         *   totalSkipped: 1,
         *   errors: [{
         *     id: 'record-123',
         *     message: 'Invalid data',
         *     timestamp: new Date().toISOString()
         *   }]
         * });
         */
        async queueMetricsUpdate(processId, metricsUpdate) {
            const queueService = getQueueService();
            if (!queueService) {
                return null; // Queue disabled
            }

            return await queueService.queueMetricsUpdate(processId, metricsUpdate);
        },

        /**
         * Queue process completion
         *
         * State Machine Event: Transition to COMPLETED (terminal state)
         * - Sets state to 'COMPLETED'
         * - Records endTime
         * - No further state transitions allowed
         *
         * @param {string} processId - Process ID
         * @returns {Promise<Object|null>} SQS response or null if queue disabled
         *
         * @example
         * // Mark process as completed
         * await commands.queueCompletion(processId);
         */
        async queueCompletion(processId) {
            const queueService = getQueueService();
            if (!queueService) {
                return null; // Queue disabled
            }

            return await queueService.queueProcessCompletion(processId);
        },

        /**
         * Queue error handling
         *
         * State Machine Event: Transition to ERROR (terminal state)
         * - Sets state to 'ERROR'
         * - Records error message and stack trace
         * - Records errorTimestamp
         * - No further state transitions allowed
         *
         * @param {string} processId - Process ID
         * @param {Error} error - Error object
         * @returns {Promise<Object|null>} SQS response or null if queue disabled
         *
         * @example
         * try {
         *   await processRecords(processId, records);
         * } catch (error) {
         *   await commands.queueError(processId, error);
         *   throw error; // Re-throw to fail worker
         * }
         */
        async queueError(processId, error) {
            const queueService = getQueueService();
            if (!queueService) {
                return null; // Queue disabled
            }

            return await queueService.queueErrorHandling(processId, error);
        },
    };
}

module.exports = {
    createProcessCommands,
};
