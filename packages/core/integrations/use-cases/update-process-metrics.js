/**
 * UpdateProcessMetrics Use Case
 * 
 * Updates process metrics, calculates aggregates, and computes estimated completion time.
 * Optionally broadcasts progress via WebSocket service if provided.
 * 
 * Design Philosophy:
 * - Metrics are cumulative (add to existing counts)
 * - Performance metrics calculated automatically (duration, records/sec)
 * - ETA computed based on current progress
 * - Error history limited to last 100 entries
 * - WebSocket broadcasting is optional (DI pattern)
 * 
 * @example
 * const updateMetrics = new UpdateProcessMetrics({ processRepository, websocketService });
 * await updateMetrics.execute(processId, {
 *   processed: 100,
 *   success: 95,
 *   errors: 5,
 *   errorDetails: [{ contactId: 'abc', error: 'Missing email', timestamp: '...' }]
 * });
 */
class UpdateProcessMetrics {
    /**
     * @param {Object} params
     * @param {ProcessRepositoryInterface} params.processRepository - Repository for process data access
     * @param {Object} [params.websocketService] - Optional WebSocket service for progress broadcasting
     */
    constructor({ processRepository, websocketService }) {
        if (!processRepository) {
            throw new Error('processRepository is required');
        }
        this.processRepository = processRepository;
        this.websocketService = websocketService;
    }

    /**
     * Execute the use case to update process metrics
     * @param {string} processId - Process ID to update
     * @param {Object} metricsUpdate - Metrics to add/update
     * @param {number} [metricsUpdate.processed=0] - Number of records processed in this batch
     * @param {number} [metricsUpdate.success=0] - Number of successful records
     * @param {number} [metricsUpdate.errors=0] - Number of failed records
     * @param {Array} [metricsUpdate.errorDetails=[]] - Error details array
     * @returns {Promise<Object>} Updated process record
     * @throws {Error} If process not found or update fails
     */
    async execute(processId, metricsUpdate) {
        // Validate inputs
        if (!processId || typeof processId !== 'string') {
            throw new Error('processId must be a non-empty string');
        }
        if (!metricsUpdate || typeof metricsUpdate !== 'object') {
            throw new Error('metricsUpdate must be an object');
        }

        // Retrieve current process
        const process = await this.processRepository.findById(processId);
        if (!process) {
            throw new Error(`Process not found: ${processId}`);
        }

        // Get current context and results
        const context = process.context || {};
        const results = process.results || { aggregateData: {} };

        // Initialize nested objects if not present
        if (!results.aggregateData) {
            results.aggregateData = {};
        }

        // Update context counters (cumulative)
        context.processedRecords = (context.processedRecords || 0) + (metricsUpdate.processed || 0);

        // Update results aggregates (cumulative)
        results.aggregateData.totalSynced = (results.aggregateData.totalSynced || 0) + (metricsUpdate.success || 0);
        results.aggregateData.totalFailed = (results.aggregateData.totalFailed || 0) + (metricsUpdate.errors || 0);

        // Append error details (limited to last 100)
        if (metricsUpdate.errorDetails && metricsUpdate.errorDetails.length > 0) {
            results.aggregateData.errors = [
                ...(results.aggregateData.errors || []),
                ...metricsUpdate.errorDetails
            ].slice(-100); // Keep only last 100 errors
        }

        // Calculate performance metrics
        const startTime = new Date(context.startTime || process.createdAt);
        const elapsed = Date.now() - startTime.getTime();
        results.aggregateData.duration = elapsed;

        if (elapsed > 0 && context.processedRecords > 0) {
            results.aggregateData.recordsPerSecond = context.processedRecords / (elapsed / 1000);
        } else {
            results.aggregateData.recordsPerSecond = 0;
        }

        // Calculate ETA if we know total
        if (context.totalRecords > 0 && context.processedRecords > 0) {
            const remaining = context.totalRecords - context.processedRecords;
            if (results.aggregateData.recordsPerSecond > 0) {
                const etaMs = (remaining / results.aggregateData.recordsPerSecond) * 1000;
                const eta = new Date(Date.now() + etaMs);
                context.estimatedCompletion = eta.toISOString();
            }
        }

        // Prepare updates
        const updates = {
            context,
            results,
        };

        // Persist updates
        let updatedProcess;
        try {
            updatedProcess = await this.processRepository.update(processId, updates);
        } catch (error) {
            throw new Error(`Failed to update process metrics: ${error.message}`);
        }

        // Broadcast progress via WebSocket (if service provided)
        if (this.websocketService) {
            await this._broadcastProgress(updatedProcess);
        }

        return updatedProcess;
    }

    /**
     * Broadcast progress update via WebSocket
     * @private
     * @param {Object} process - Updated process record
     */
    async _broadcastProgress(process) {
        try {
            const context = process.context || {};
            const results = process.results || { aggregateData: {} };
            const aggregateData = results.aggregateData || {};

            await this.websocketService.broadcast({
                type: 'PROCESS_PROGRESS',
                data: {
                    processId: process.id,
                    processName: process.name,
                    processType: process.type,
                    state: process.state,
                    processed: context.processedRecords || 0,
                    total: context.totalRecords || 0,
                    successCount: aggregateData.totalSynced || 0,
                    errorCount: aggregateData.totalFailed || 0,
                    recordsPerSecond: aggregateData.recordsPerSecond || 0,
                    estimatedCompletion: context.estimatedCompletion || null,
                    timestamp: new Date().toISOString(),
                }
            });
        } catch (error) {
            // Log but don't fail the update if WebSocket broadcast fails
            console.error('Failed to broadcast process progress:', error);
        }
    }
}

module.exports = { UpdateProcessMetrics };

