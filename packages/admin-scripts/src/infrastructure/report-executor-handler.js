const { createReportRunner } = require('../application/report-runner');
const {
    createReportCommands,
} = require('@friggframework/core/application/commands/report-commands');
const { QueuerUtil } = require('@friggframework/core/queues');
const { bootstrapAdminScripts } = require('./bootstrap');

// Re-enqueue a report that yielded a continuation so the next invocation
// resumes the SAME execution. The resume state travels in the message
// (params.__resume); the execution record stays RUNNING between hops.
async function requeueContinuation(message, result) {
    const queueUrl = process.env.REPORT_QUEUE_URL;
    if (!queueUrl) {
        throw new Error(
            'Report yielded a continuation but REPORT_QUEUE_URL is not set; cannot resume'
        );
    }

    await QueuerUtil.send(
        {
            reportName: message.reportName,
            executionId: result.executionId,
            mode: message.mode || 'recorded',
            ...(message.seriesName && { seriesName: message.seriesName }),
            trigger: 'QUEUE',
            params: { ...(message.params || {}), __resume: result.continuation },
            resumeAt: new Date().toISOString(),
        },
        queueUrl
    );
}

/**
 * Run a single report execution message through the ReportRunner.
 * @param {Object} message - Parsed execution message.
 * @param {string} message.reportName - Name of the registered report to run (required).
 * @param {string} [message.executionId] - Existing report execution id to resume; when
 *   absent, ReportRunner creates a new record.
 * @param {string} [message.mode] - Run mode; defaults to 'recorded'.
 * @param {string} [message.seriesName] - Snapshot series tag (snapshot mode).
 * @param {string} [message.trigger] - Execution trigger; defaults to 'QUEUE'.
 * @param {Object} [message.params] - Parameters passed to the report.
 * @param {string} [message.parentExecutionId] - Parent execution id for continuations.
 * @param {Object} deps
 * @param {Object} deps.reportFactory - Registry used to resolve and instantiate the report.
 * @param {Object} deps.reportCommands - Report execution-store commands.
 * @param {Object} deps.reportFriggCommands - Data-read command bundle exposed to the report.
 * @param {Object} deps.integrationFactory - Hydrates integration instances for reports that need them.
 * @returns {Promise<{ reportName: string, status: string, executionId: string }>}
 * @private
 */
async function runMessage(
    message,
    { reportFactory, reportCommands, reportFriggCommands, integrationFactory },
    lambdaContext
) {
    const {
        reportName,
        executionId,
        mode,
        seriesName,
        trigger,
        params,
        parentExecutionId,
    } = message;

    if (!reportName) {
        throw new Error('Invalid message: missing reportName');
    }

    console.log(
        `Processing report: ${reportName}${
            executionId ? `, executionId: ${executionId}` : ''
        }`
    );

    const runner = createReportRunner({
        reportFactory,
        reportCommands,
        friggCommands: reportFriggCommands,
        integrationFactory,
    });
    const result = await runner.execute(reportName, params, {
        mode: mode || 'recorded',
        trigger: trigger || 'QUEUE',
        // executionId is optional — when absent, ReportRunner creates the record.
        // Scheduled direct invokes have no id yet.
        ...(executionId && { executionId }),
        ...(seriesName && { seriesName }),
        ...(parentExecutionId && { parentExecutionId }),
        ...(lambdaContext && { lambdaContext }),
    });

    if (result.status === 'CONTINUE') {
        // If re-enqueue fails, the execution will never resume, so it must not
        // linger in RUNNING. Compensate with the RUNNER-created id (the inbound
        // message may carry none, e.g. a scheduled first run), then rethrow so
        // the batch/invoke error handling still records the failure.
        try {
            await requeueContinuation(message, result);
        } catch (requeueError) {
            await markFailed(result.executionId, requeueError);
            throw requeueError;
        }
        console.log(
            `Report re-queued for continuation: ${reportName}, executionId: ${result.executionId}`
        );
    }

    return {
        reportName,
        status: result.status,
        executionId: result.executionId,
    };
}

/**
 * Mark a report execution FAILED when the worker itself blows up (parse error,
 * runner construction), so the record doesn't stay stuck in a non-terminal
 * state. No-op when there is no execution id.
 * @private
 */
async function markFailed(executionId, error) {
    if (!executionId) return;
    try {
        const commands = createReportCommands();
        await commands.completeExecution(executionId, {
            state: 'FAILED',
            error: {
                name: error.name,
                message: error.message,
                stack: error.stack,
            },
        });
    } catch (updateError) {
        console.error(
            `Failed to update report execution ${executionId} state:`,
            updateError
        );
    }
}

/**
 * Handle an EventBridge Scheduler direct invoke: the event itself is a single
 * execution message (no `Records` wrapper).
 * @private
 */
async function handleScheduledInvoke(event, deps, lambdaContext) {
    try {
        const result = await runMessage(event, deps, lambdaContext);
        console.log(
            `Report completed: ${result.reportName}, status: ${result.status}`
        );
        return {
            statusCode: 200,
            body: JSON.stringify({ processed: 1, results: [result] }),
        };
    } catch (error) {
        console.error('Unexpected error processing scheduled invoke:', error);
        await markFailed(event.executionId, error);
        return {
            statusCode: 200,
            body: JSON.stringify({
                processed: 1,
                results: [
                    {
                        reportName: event.reportName || 'unknown',
                        status: 'FAILED',
                        error: error.message,
                    },
                ],
            }),
        };
    }
}

/**
 * Handle an SQS batch: each `event.Records[].body` is a JSON execution message.
 * Failures are isolated per record so one bad message doesn't drop the rest of
 * the batch.
 * @private
 */
async function handleSqsBatch(event, deps, lambdaContext) {
    const results = [];
    for (const record of event.Records) {
        let message = {};
        try {
            message = JSON.parse(record.body);
            const result = await runMessage(message, deps, lambdaContext);
            console.log(
                `Report completed: ${result.reportName}, status: ${result.status}`
            );
            results.push(result);
        } catch (error) {
            // Only unexpected failures reach here (message parse errors, runner
            // construction). Report execution errors are handled by ReportRunner
            // and returned as { status: 'FAILED' }.
            console.error('Unexpected error processing record:', error);
            await markFailed(message.executionId, error);
            results.push({
                reportName: message.reportName || 'unknown',
                status: 'FAILED',
                error: error.message,
            });
        }
    }

    return {
        statusCode: 200,
        body: JSON.stringify({ processed: results.length, results }),
    };
}

/**
 * Report Executor Lambda Handler
 *
 * Handles two invocation shapes:
 * - SQS: `event.Records[]` — each record body is a JSON execution message
 *   (manual async report runs).
 * - EventBridge Scheduler direct invoke: the event itself is the message
 *   (`{ reportName, trigger: 'SCHEDULED', mode, params }`) with no `Records`.
 *
 * Thin adapter: parses the event and delegates to ReportRunner, which owns
 * execution tracking, error recording, and status updates.
 */
async function handler(event, context) {
    const {
        reportFactory,
        reportCommands,
        reportFriggCommands,
        integrationFactory,
    } = bootstrapAdminScripts();
    const deps = {
        reportFactory,
        reportCommands,
        reportFriggCommands,
        integrationFactory,
    };

    return event.Records
        ? handleSqsBatch(event, deps, context)
        : handleScheduledInvoke(event, deps, context);
}

module.exports = { handler };
