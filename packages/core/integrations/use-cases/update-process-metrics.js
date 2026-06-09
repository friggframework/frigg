/**
 * UpdateProcessMetrics Use Case
 *
 * Updates process metrics atomically via
 * `processRepository.applyProcessUpdate`. This is the race-safe
 * replacement for the original read-modify-write implementation — the
 * long-standing TODO about lost updates under concurrent writers is
 * now resolved.
 *
 * Split into two phases:
 *
 *   1. Atomic phase — counters and bounded error history. Uses
 *      $inc / $push+$slice (Mongo/DocumentDB) or jsonb_set with
 *      arithmetic expressions (Postgres) in a single UPDATE ... RETURNING
 *      so concurrent callers serialize at the DB layer.
 *
 *   2. Derived-fields phase — duration, recordsPerSecond,
 *      estimatedCompletion. Computed from the post-atomic snapshot and
 *      written via the legacy (non-atomic) `update()` method.
 *      Intentionally best-effort: under concurrent writers they reflect
 *      "whichever handler wrote last" — the same semantics they had
 *      before and all they've ever guaranteed. Preserved for backward
 *      compatibility with consumers (UI, WebSocket listeners).
 *
 * Optionally broadcasts progress via WebSocket service if provided.
 *
 * @example
 * const updateMetrics = new UpdateProcessMetrics({ processRepository, websocketService });
 * await updateMetrics.execute(processId, {
 *   processed: 100,
 *   success: 92,
 *   errors: 5,
 *   skipped: 3,
 *   errorDetails: [{ contactId: 'abc', error: 'Missing email', timestamp: '...' }]
 * });
 */
const { invalidProcessData, processNotFound } = require('./process-errors');

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
     * @param {number} [metricsUpdate.processed=0] - Records processed in this batch
     * @param {number} [metricsUpdate.success=0] - Successful records
     * @param {number} [metricsUpdate.errors=0] - Failed records
     * @param {number} [metricsUpdate.skipped=0] - Intentionally-skipped
     *     records (hash-match, dedupe, loop protection, etc.). Increments
     *     `results.aggregateData.totalSkipped`. Distinct from errors so the
     *     UI can show `processed = synced + failed + skipped` without
     *     conflating intentional skips with failures.
     * @param {Array} [metricsUpdate.errorDetails=[]] - Error details array
     * @returns {Promise<Object>} Updated process record
     * @throws {Error} If process not found or update fails
     */
    async execute(processId, metricsUpdate) {
        if (!processId || typeof processId !== 'string') {
            throw invalidProcessData('processId must be a non-empty string');
        }
        if (!metricsUpdate || typeof metricsUpdate !== 'object') {
            throw invalidProcessData('metricsUpdate must be an object');
        }

        // Phase 1: atomic increments + bounded error history.
        const increment = {};
        const processed = metricsUpdate.processed || 0;
        const success = metricsUpdate.success || 0;
        const errors = metricsUpdate.errors || 0;
        const skipped = metricsUpdate.skipped || 0;
        if (processed) increment['context.processedRecords'] = processed;
        if (success) increment['results.aggregateData.totalSynced'] = success;
        if (errors) increment['results.aggregateData.totalFailed'] = errors;
        if (skipped) increment['results.aggregateData.totalSkipped'] = skipped;

        const pushSlice = {};
        if (
            Array.isArray(metricsUpdate.errorDetails) &&
            metricsUpdate.errorDetails.length > 0
        ) {
            pushSlice['results.aggregateData.errors'] = {
                values: metricsUpdate.errorDetails,
                keepLast: 100,
            };
        }

        const hasAtomicWork =
            Object.keys(increment).length > 0 ||
            Object.keys(pushSlice).length > 0;

        let updatedProcess;
        try {
            if (hasAtomicWork) {
                updatedProcess = await this.processRepository.applyProcessUpdate(
                    processId,
                    { increment, pushSlice }
                );
            } else {
                // All-zero update (e.g., empty batch) — nothing to persist;
                // just read current state for the derived-fields pass.
                updatedProcess = await this.processRepository.findById(
                    processId
                );
            }
        } catch (error) {
            throw new Error(
                `Failed to update process metrics: ${error.message}`
            );
        }

        if (!updatedProcess) {
            throw processNotFound(`Process not found: ${processId}`);
        }

        // Phase 2: derived metrics (non-atomic, best-effort). Preserved
        // for backward compatibility — these were always stale under
        // concurrent writers even before this refactor.
        const context = updatedProcess.context || {};
        const results = updatedProcess.results || { aggregateData: {} };
        if (!results.aggregateData) results.aggregateData = {};

        if (context.processedRecords > 0 || context.totalRecords > 0) {
            const startTime = new Date(
                context.startTime || updatedProcess.createdAt
            );
            const elapsed = Date.now() - startTime.getTime();
            results.aggregateData.duration = elapsed;

            if (elapsed > 0 && context.processedRecords > 0) {
                results.aggregateData.recordsPerSecond =
                    context.processedRecords / (elapsed / 1000);
            } else {
                results.aggregateData.recordsPerSecond = 0;
            }

            if (context.totalRecords > 0 && context.processedRecords > 0) {
                const remaining =
                    context.totalRecords - context.processedRecords;
                if (results.aggregateData.recordsPerSecond > 0) {
                    const etaMs =
                        (remaining / results.aggregateData.recordsPerSecond) *
                        1000;
                    const eta = new Date(Date.now() + etaMs);
                    context.estimatedCompletion = eta.toISOString();
                }
            }

            try {
                updatedProcess = await this.processRepository.update(
                    processId,
                    { context, results }
                );
            } catch (error) {
                // Derived-field write failures are NON-FATAL — atomic
                // counters from phase 1 already landed. Log and return the
                // post-atomic snapshot.
                console.error(
                    '[UpdateProcessMetrics] derived-fields write failed (non-fatal):',
                    error.message
                );
            }
        }

        if (this.websocketService) {
            await this._broadcastProgress(updatedProcess);
        }

        return updatedProcess;
    }

    /**
     * Broadcast progress update via WebSocket
     * @private
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
                    skippedCount: aggregateData.totalSkipped || 0,
                    recordsPerSecond: aggregateData.recordsPerSecond || 0,
                    estimatedCompletion: context.estimatedCompletion || null,
                    timestamp: new Date().toISOString(),
                },
            });
        } catch (error) {
            console.error('Failed to broadcast process progress:', error);
        }
    }
}

module.exports = { UpdateProcessMetrics };
