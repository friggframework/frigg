const { ProcessQueueService } = require('../services/process-queue-service');

/**
 * Singleton instance of ProcessQueueService
 * Lazy-initialized when first needed
 */
let queueServiceInstance = null;

/**
 * Gets or creates the ProcessQueueService instance
 * @returns {ProcessQueueService} Queue service instance
 * @throws {Error} If queue is enabled but PROCESS_MANAGEMENT_QUEUE_URL is not set
 */
function getQueueService() {
    if (!queueServiceInstance) {
        const queueUrl = process.env.PROCESS_MANAGEMENT_QUEUE_URL;

        if (!queueUrl) {
            throw new Error(
                'PROCESS_MANAGEMENT_QUEUE_URL environment variable is required when process queue is enabled'
            );
        }

        queueServiceInstance = new ProcessQueueService({ queueUrl });
    }

    return queueServiceInstance;
}

/**
 * Checks if the process management queue is enabled
 * @returns {boolean} True if enabled
 */
function isEnabled() {
    const enabled = process.env.PROCESS_QUEUE_ENABLED;
    return enabled ? enabled.toLowerCase() === 'true' : false;
}

/**
 * Utility for queueing process updates
 *
 * Usage:
 *   - Set PROCESS_QUEUE_ENABLED=true to enable queue
 *   - Set PROCESS_MANAGEMENT_QUEUE_URL to the queue URL
 *   - Use queueProcessUpdate.queueStateUpdate(), etc. to queue updates
 *   - If queue is disabled, functions return null (no-op)
 *
 * Benefits:
 *   - Simple API for queueing process updates
 *   - Automatic enable/disable via environment variables
 *   - Prevents race conditions when enabled
 *   - Backward compatible (returns null when disabled)
 *
 * Example:
 *   ```javascript
 *   const { queueProcessUpdate } = require('@friggframework/core');
 *
 *   // Queue a state update
 *   await queueProcessUpdate.queueStateUpdate(
 *     processId,
 *     'RUNNING',
 *     { step: 1, batchId: 'batch-123' }
 *   );
 *
 *   // Queue a metrics update
 *   await queueProcessUpdate.queueMetricsUpdate(
 *     processId,
 *     { totalProcessed: 100, totalFailed: 2 }
 *   );
 *
 *   // Queue process completion
 *   await queueProcessUpdate.queueProcessCompletion(processId);
 *
 *   // Queue error handling
 *   await queueProcessUpdate.queueErrorHandling(processId, error);
 *
 *   // Check if queue is enabled
 *   if (queueProcessUpdate.isEnabled()) {
 *     console.log('Process queue is enabled');
 *   }
 *   ```
 */
const queueProcessUpdate = {
    /**
     * Checks if the process management queue is enabled
     * @returns {boolean} True if enabled
     */
    isEnabled,

    /**
     * Queues a process state update
     *
     * @param {string} processId - Process ID
     * @param {string} state - New state
     * @param {Object} [contextUpdates] - Context updates
     * @returns {Promise<Object|null>} SQS response or null if disabled
     * @throws {Error} If queue is enabled but configuration is invalid
     *
     * @example
     * await queueProcessUpdate.queueStateUpdate(
     *   'proc-123',
     *   'RUNNING',
     *   { step: 2, currentBatch: 'batch-456' }
     * );
     */
    async queueStateUpdate(processId, state, contextUpdates) {
        if (!isEnabled()) {
            return null;
        }

        const queueService = getQueueService();
        return await queueService.queueStateUpdate(processId, state, contextUpdates);
    },

    /**
     * Queues a process metrics update
     *
     * @param {string} processId - Process ID
     * @param {Object} metricsUpdate - Metrics to update
     * @returns {Promise<Object|null>} SQS response or null if disabled
     * @throws {Error} If queue is enabled but configuration is invalid
     *
     * @example
     * await queueProcessUpdate.queueMetricsUpdate(
     *   'proc-123',
     *   { totalProcessed: 100, totalFailed: 2, totalSkipped: 5 }
     * );
     */
    async queueMetricsUpdate(processId, metricsUpdate) {
        if (!isEnabled()) {
            return null;
        }

        const queueService = getQueueService();
        return await queueService.queueMetricsUpdate(processId, metricsUpdate);
    },

    /**
     * Queues process completion
     *
     * @param {string} processId - Process ID
     * @returns {Promise<Object|null>} SQS response or null if disabled
     * @throws {Error} If queue is enabled but configuration is invalid
     *
     * @example
     * await queueProcessUpdate.queueProcessCompletion('proc-123');
     */
    async queueProcessCompletion(processId) {
        if (!isEnabled()) {
            return null;
        }

        const queueService = getQueueService();
        return await queueService.queueProcessCompletion(processId);
    },

    /**
     * Queues error handling
     *
     * @param {string} processId - Process ID
     * @param {Error} error - Error object
     * @returns {Promise<Object|null>} SQS response or null if disabled
     * @throws {Error} If queue is enabled but configuration is invalid
     *
     * @example
     * try {
     *   // ... processing
     * } catch (error) {
     *   await queueProcessUpdate.queueErrorHandling('proc-123', error);
     * }
     */
    async queueErrorHandling(processId, error) {
        if (!isEnabled()) {
            return null;
        }

        const queueService = getQueueService();
        return await queueService.queueErrorHandling(processId, error);
    },
};

module.exports = { queueProcessUpdate };
