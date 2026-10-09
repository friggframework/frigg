const { createReportRunner } = require('../application/report-runner');
const {
    createReportCommands,
} = require('@friggframework/core/application/commands/report-commands');
const { QueuerUtil } = require('@friggframework/core/queues');
const { bootstrapAdminScripts } = require('./bootstrap');

// Resume state travels in the message (params.__resume); the execution record
// stays RUNNING across hops so the same execution resumes.
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
        // Scheduled first runs carry no executionId; ReportRunner creates the record.
        ...(executionId && { executionId }),
        ...(seriesName && { seriesName }),
        ...(parentExecutionId && { parentExecutionId }),
        ...(lambdaContext && { lambdaContext }),
    });

    if (result.status === 'CONTINUE') {
        // A failed re-enqueue means the execution never resumes; mark it FAILED
        // (via the runner-created id) instead of leaving it stuck in RUNNING.
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

// Mark a report execution FAILED when the worker itself throws, so the record
// doesn't stay stuck in a non-terminal state.
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

// EventBridge Scheduler direct invoke: the event itself is the message (no `Records` wrapper).
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

// SQS batch: each record body is a JSON message. Failures are isolated per
// record so one bad message doesn't drop the rest of the batch.
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
            // Report execution errors are handled by ReportRunner; only
            // unexpected failures (parse, runner construction) reach here.
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
 * Report Executor Lambda handler. Two invocation shapes:
 * - SQS: `event.Records[]`, each body a JSON execution message.
 * - EventBridge Scheduler direct invoke: the event itself is the message, no `Records`.
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
