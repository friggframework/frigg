const ERROR_CODE_MAP = {
    EXECUTION_NOT_FOUND: 404,
};

function mapErrorToResponse(error) {
    const status = ERROR_CODE_MAP[error?.code] || 500;
    return { error: status, reason: error?.message, code: error?.code };
}

/**
 * Report commands share the AdminScriptExecution store, discriminated by
 * type:'REPORT'. That store has no user/integration FK, and findExecutionById
 * rejects non-REPORT rows, so a report lookup can never return another
 * operation type's record (ADR-010 Decision 3).
 */
function createReportCommands({ artifactRepository } = {}) {
    const {
        createAdminScriptExecutionRepository,
    } = require('../../admin-scripts/repositories/admin-script-execution-repository-factory');

    const executionRepository = createAdminScriptExecutionRepository();

    let artifactRepo = artifactRepository || null;
    function getArtifactRepository() {
        if (!artifactRepo) {
            const {
                createArtifactRepository,
            } = require('../../artifacts/repositories/artifact-repository-factory');
            artifactRepo = createArtifactRepository();
        }
        return artifactRepo;
    }

    // Resolve to null rather than throw: a read must not fail because signing did.
    async function signArtifact(ref) {
        if (!ref) return null;
        try {
            return await getArtifactRepository().signedUrl(ref);
        } catch (_error) {
            return null;
        }
    }

    return {
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

        async findExecutionById(id) {
            try {
                const record = await executionRepository.findExecutionById(id);
                if (!record || record.type !== 'REPORT') {
                    const error = new Error(`Report execution ${id} not found`);
                    error.code = 'EXECUTION_NOT_FOUND';
                    return mapErrorToResponse(error);
                }
                // The stored artifact ref is not retrievable on its own; sign it on read.
                if (record.results?.artifact) {
                    record.results = {
                        ...record.results,
                        artifactUrl: await signArtifact(record.results.artifact),
                    };
                }
                return record;
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },

        // Never-throws: returns [] on error (non-critical read).
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

        // No mode index in the store, so fetch by name/window and filter snapshots
        // in JS. Never-throws: returns [] on error.
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
                const snapshots = rows.filter(
                    (row) => row.context?.mode === 'snapshot'
                );
                return Promise.all(
                    snapshots.map(async (row) => ({
                        executionId: row.id,
                        capturedAt: row.createdAt,
                        summary:
                            row.results?.output?.summary ??
                            row.results?.summary ??
                            null,
                        artifactUrl: await signArtifact(row.results?.artifact),
                    }))
                );
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

        // results.output is the inline JSON payload; results.summary + results.artifact
        // are a large/binary payload's summary + object-store reference.
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
