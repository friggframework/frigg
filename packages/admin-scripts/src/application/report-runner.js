const { createAdminScriptContext } = require('./admin-script-context');
const { validateParams } = require('./validate-script-input');

const ARTIFACT_CONTENT_TYPES = {
    csv: 'text/csv',
    json: 'application/json',
    pdf: 'application/pdf',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    html: 'text/html',
    txt: 'text/plain',
    xml: 'application/xml',
    zip: 'application/zip',
};

// The run mode decides persistence: live computes inline and records nothing,
// recorded persists an execution record, snapshot additionally tags the run
// into a named series. Reports read only through the injected frigg command
// bundle (exposed as context.commands).
class ReportRunner {
    constructor(params = {}) {
        if (!params.reportFactory) {
            throw new Error('ReportRunner requires a reportFactory');
        }
        this.reportFactory = params.reportFactory;
        this.reportCommands = params.reportCommands || null;
        this.friggCommands = params.friggCommands || null;
        this.integrationFactory = params.integrationFactory || null;
        this.artifactRepository = params.artifactRepository || null;
    }

    _getArtifactRepository() {
        if (!this.artifactRepository) {
            const {
                createArtifactRepository,
            } = require('@friggframework/core/artifacts/repositories/artifact-repository-factory');
            this.artifactRepository = createArtifactRepository();
        }
        return this.artifactRepository;
    }

    async execute(reportName, params = {}, options = {}) {
        const ReportClass = this.reportFactory.get(reportName);
        const definition = ReportClass.Definition;

        const runModes =
            Array.isArray(definition.runModes) && definition.runModes.length
                ? definition.runModes
                : ['live'];
        const mode = options.mode || runModes[0];
        if (!runModes.includes(mode)) {
            const error = new Error(
                `Report "${reportName}" does not support mode "${mode}". Allowed: ${runModes.join(
                    ', '
                )}`
            );
            error.code = 'INVALID_MODE';
            throw error;
        }

        const validation = validateParams(definition, params);
        if (!validation.valid) {
            const error = new Error(
                `Invalid input: ${validation.errors.join(', ')}`
            );
            error.code = 'INVALID_INPUT';
            throw error;
        }

        const format = definition.output?.format || 'json';

        if (mode === 'live') {
            // Non-JSON can't be returned inline as a response body; it needs an
            // artifact, so it must run recorded/snapshot.
            if (format !== 'json') {
                const error = new Error(
                    `Report "${reportName}" output format "${format}" cannot be returned inline; run it in recorded or snapshot mode`
                );
                error.code = 'ARTIFACT_STORAGE_UNAVAILABLE';
                throw error;
            }
            return this._runLive(reportName, params);
        }

        return this._runRecorded(reportName, definition, params, mode, options);
    }

    async _runLive(reportName, params) {
        const startTime = new Date();
        // executionId null: live persists nothing, so record-dependent logging
        // and chaining are intentionally inert.
        const context = createAdminScriptContext({
            executionId: null,
            integrationFactory: this.integrationFactory,
            commands: this.friggCommands,
        });

        const report = this.reportFactory.createInstance(reportName, {
            context,
            executionId: null,
            integrationFactory: this.integrationFactory,
        });

        const output = await report.execute(context.commands, params, context);

        return {
            status: 'COMPLETED',
            reportName,
            mode: 'live',
            output,
            metrics: { durationMs: new Date() - startTime },
        };
    }

    // Completion is written OUTSIDE the try on success so a persistence failure
    // is never misreported as a report failure.
    async _runRecorded(reportName, definition, params, mode, options = {}) {
        let executionId = options.executionId;

        if (!executionId) {
            const execution = await this.reportCommands.createExecution({
                reportName,
                reportVersion: definition.version,
                trigger: options.trigger || 'MANUAL',
                mode,
                input: params,
                audit: options.audit,
                seriesName:
                    mode === 'snapshot'
                        ? options.seriesName || reportName
                        : undefined,
                parentExecutionId: options.parentExecutionId,
            });
            if (execution.error) {
                throw new Error(
                    execution.reason ||
                        'Failed to create report execution record'
                );
            }
            executionId = execution.id;
        }

        const startTime = new Date();
        const context = createAdminScriptContext({
            executionId,
            integrationFactory: this.integrationFactory,
            commands: this.friggCommands,
            lambdaContext: options.lambdaContext,
        });

        const format = definition.output?.format || 'json';
        let output;
        let artifact = null;
        let summary;
        try {
            await this.reportCommands.updateExecutionState(
                executionId,
                'RUNNING'
            );

            const report = this.reportFactory.createInstance(reportName, {
                context,
                executionId,
                integrationFactory: this.integrationFactory,
            });

            output = await report.execute(context.commands, params, context);

            // Store non-JSON output as an artifact inside the try so a put
            // failure marks the run FAILED (a continuation yield has none yet).
            if (format !== 'json' && !(output && output.__continuation)) {
                const stamp = new Date()
                    .toISOString()
                    .replace(/[:.]/g, '-');
                const fileType = output.fileType || format;
                const key = `reports/${executionId}/${reportName}-${stamp}.${fileType}`;
                const contentType =
                    ARTIFACT_CONTENT_TYPES[fileType] ||
                    'application/octet-stream';
                artifact = await this._getArtifactRepository().put(
                    key,
                    output.file,
                    contentType
                );
                summary = output.summary;
            }
        } catch (error) {
            const durationMs = new Date() - startTime;
            await this.reportCommands.completeExecution(executionId, {
                state: 'FAILED',
                error: {
                    name: error.name,
                    message: error.message,
                    stack: error.stack,
                },
                metrics: {
                    startTime: startTime.toISOString(),
                    endTime: new Date().toISOString(),
                    durationMs,
                },
                logs: context.getLogs(),
            });

            return {
                executionId,
                status: 'FAILED',
                reportName,
                mode,
                error: { name: error.name, message: error.message },
                metrics: { durationMs },
            };
        }

        // Opt-in self-requeue: a report yields by returning a truthy
        // `__continuation` (its resume state) instead of a final result. The
        // execution stays RUNNING and the executor re-enqueues the SAME id, so
        // the report resumes from the marker on the next invocation.
        if (output && output.__continuation) {
            const resumeState = output.__continuation;
            if (typeof this.reportCommands.appendExecutionLog === 'function') {
                await this.reportCommands.appendExecutionLog(executionId, {
                    level: 'info',
                    message: 'report yielded a continuation; re-queueing',
                    data: { resumeAt: new Date().toISOString() },
                    timestamp: new Date().toISOString(),
                });
            }
            return {
                executionId,
                status: 'CONTINUE',
                reportName,
                mode,
                continuation: resumeState,
                metrics: { durationMs: new Date() - startTime },
            };
        }

        const durationMs = new Date() - startTime;
        const isArtifact = format !== 'json';
        const result = {
            executionId,
            status: 'COMPLETED',
            reportName,
            mode,
            ...(isArtifact ? { summary, artifact } : { output }),
            metrics: { durationMs },
        };

        const completion = await this.reportCommands.completeExecution(
            executionId,
            {
                state: 'COMPLETED',
                ...(isArtifact ? { summary, artifact } : { output }),
                metrics: {
                    startTime: startTime.toISOString(),
                    endTime: new Date().toISOString(),
                    durationMs,
                },
                logs: context.getLogs(),
            }
        );
        if (completion?.error) {
            result.stateUpdateFailed = true;
        }

        return result;
    }
}

function createReportRunner(params = {}) {
    return new ReportRunner(params);
}

module.exports = { ReportRunner, createReportRunner };
