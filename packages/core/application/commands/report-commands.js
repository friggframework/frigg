const ERROR_CODE_MAP = {
    EXECUTION_NOT_FOUND: 404,
};

function mapErrorToResponse(error) {
    const status = ERROR_CODE_MAP[error?.code] || 500;
    return { error: status, reason: error?.message, code: error?.code };
}

/**
 * Report execution commands.
 *
 * Sibling of createAdminScriptCommands (admin-script-commands.js): reports reuse
 * the SAME isolated AdminScriptExecution store, discriminated by type:'REPORT'.
 * A separate command surface keeps report vocabulary (run modes, series) out of
 * the script commands while sharing storage — the same rationale that keeps
 * admin-script-commands separate from integration-commands.
 *
 * Isolation (ADR-010 Decision 3): AdminScriptExecution has no user/integration
 * FK, so it can never surface in a user-scoped Process query. findExecutionById
 * additionally rejects any row whose type !== 'REPORT', so a report lookup can
 * never return a script/migration record.
 *
 * @returns {Object} Command methods for report executions
 */
function createReportCommands() {
    const {
        createAdminScriptExecutionRepository,
    } = require('../../admin-scripts/repositories/admin-script-execution-repository-factory');

    const executionRepository = createAdminScriptExecutionRepository();

    return {
        /**
         * Create a report execution record (recorded/snapshot modes).
         * @param {Object} params
         * @param {string} params.reportName
         * @param {string} [params.reportVersion]
         * @param {string} params.trigger - 'MANUAL' | 'SCHEDULED' | 'QUEUE'
         * @param {string} [params.mode] - 'recorded' | 'snapshot' (default 'recorded')
         * @param {Object} [params.input]
         * @param {Object} [params.audit]
         * @param {string} [params.seriesName] - snapshot series tag
         * @param {string|number} [params.parentExecutionId]
         */
        async createExecution({
            reportName,
            reportVersion,
            trigger,
            mode,
            input,
            audit,
            seriesName,
            parentExecutionId,
        }) {
            try {
                return await executionRepository.createExecution({
                    name: reportName,
                    type: 'REPORT',
                    parentExecutionId,
                    context: {
                        reportVersion,
                        trigger,
                        mode: mode || 'recorded',
                        input,
                        audit,
                        ...(seriesName ? { seriesName } : {}),
                    },
                });
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },

        /**
         * Fetch one report execution. Guarded: a non-REPORT row (script,
         * migration) is reported as not found so report lookups can never
         * surface another operation type's record.
         */
        async findExecutionById(id) {
            try {
                const record = await executionRepository.findExecutionById(id);
                if (!record || record.type !== 'REPORT') {
                    const error = new Error(`Report execution ${id} not found`);
                    error.code = 'EXECUTION_NOT_FOUND';
                    return mapErrorToResponse(error);
                }
                return record;
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },

        /**
         * List report executions for a report name, newest first.
         * Never-throws: returns [] on error (non-critical read).
         */
        async listExecutionsByName(reportName, { limit, offset, state } = {}) {
            try {
                return await executionRepository.findExecutionsByName(
                    reportName,
                    { type: 'REPORT', limit, offset, state }
                );
            } catch (error) {
                return [];
            }
        },

        /**
         * Read a report's snapshot series over a time window, oldest first.
         * Snapshots are recorded executions tagged with context.mode==='snapshot';
         * the store has no mode index, so rows are fetched by name/window then
         * filtered in JS. Never-throws: returns [] on error.
         */
        async findSnapshotSeries(reportName, { from, to, limit } = {}) {
            try {
                const rows = await executionRepository.findExecutionsByName(
                    reportName,
                    {
                        type: 'REPORT',
                        from,
                        to,
                        sortBy: 'createdAt',
                        sortOrder: 'asc',
                        limit,
                    }
                );
                return rows
                    .filter((row) => row.context?.mode === 'snapshot')
                    .map((row) => ({
                        executionId: row.id,
                        capturedAt: row.createdAt,
                        summary:
                            row.results?.output?.summary ??
                            row.results?.summary ??
                            null,
                        artifactUrl: row.results?.artifact ?? null,
                    }));
            } catch (error) {
                return [];
            }
        },

        async updateExecutionState(id, state) {
            try {
                return await executionRepository.updateExecutionState(id, state);
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },

        async appendExecutionLog(id, logEntry) {
            try {
                return await executionRepository.appendExecutionLog(id, logEntry);
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },

        /**
         * Finalize a report execution: set state and merge results in one pass.
         * results.output holds an inline (JSON) payload; results.summary +
         * results.artifact hold a large/binary payload's summary + object-store
         * reference (artifact storage is a later phase).
         */
        async completeExecution(
            id,
            { state, output, summary, artifact, error, metrics, logs } = {}
        ) {
            try {
                if (state) {
                    await executionRepository.updateExecutionState(id, state);
                }
                const resultsUpdate = {};
                if (output !== undefined) resultsUpdate.output = output;
                if (summary !== undefined) resultsUpdate.summary = summary;
                if (artifact !== undefined) resultsUpdate.artifact = artifact;
                if (error) resultsUpdate.error = error;
                if (metrics) resultsUpdate.metrics = metrics;
                if (logs) resultsUpdate.logs = logs;
                if (Object.keys(resultsUpdate).length > 0) {
                    await executionRepository.updateExecutionResults(
                        id,
                        resultsUpdate
                    );
                }
                return { success: true };
            } catch (err) {
                return mapErrorToResponse(err);
            }
        },
    };
}

module.exports = { createReportCommands };
