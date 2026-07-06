const { createScriptRunner } = require('../application/script-runner');
const {
    createAdminScriptCommands,
} = require('@friggframework/core/application/commands/admin-script-commands');
const { bootstrapAdminScripts } = require('./bootstrap');

/**
 * Run a single execution message through the ScriptRunner.
 * @private
 */
async function runMessage(message, integrationFactory) {
    const { scriptName, executionId, trigger, params, parentExecutionId } =
        message;

    if (!scriptName) {
        throw new Error('Invalid message: missing scriptName');
    }

    console.log(
        `Processing script: ${scriptName}${
            executionId ? `, executionId: ${executionId}` : ''
        }`
    );

    const runner = createScriptRunner({ integrationFactory });
    const result = await runner.execute(scriptName, params, {
        trigger: trigger || 'QUEUE',
        mode: 'async',
        // executionId is optional — when absent, ScriptRunner creates the record.
        // Scheduled direct invokes and queueScript continuations have no id yet.
        ...(executionId && { executionId }),
        ...(parentExecutionId && { parentExecutionId }),
    });

    return {
        scriptName,
        status: result.status,
        executionId: result.executionId,
    };
}

/**
 * Mark an admin process FAILED when the worker itself blows up (parse error,
 * runner construction), so the record doesn't stay stuck in a non-terminal
 * state. No-op when there is no execution id.
 * @private
 */
async function markFailed(executionId, error) {
    if (!executionId) return;
    try {
        const commands = createAdminScriptCommands();
        await commands.completeAdminProcess(executionId, {
            state: 'FAILED',
            error: {
                name: error.name,
                message: error.message,
                stack: error.stack,
            },
        });
    } catch (updateError) {
        console.error(
            `Failed to update execution ${executionId} state:`,
            updateError
        );
    }
}

/**
 * Admin Script Executor Lambda Handler
 *
 * Handles two invocation shapes:
 * - SQS: `event.Records[]` — each record body is a JSON execution message
 *   (manual async executions and queueScript continuations).
 * - EventBridge Scheduler direct invoke: the event itself is the message
 *   (`{ scriptName, trigger: 'SCHEDULED', params }`) with no `Records` wrapper.
 *
 * Thin adapter: parses the event and delegates to ScriptRunner, which owns
 * execution tracking, error recording, and status updates.
 */
async function handler(event) {
    const { integrationFactory } = bootstrapAdminScripts();

    // EventBridge Scheduler invokes the Lambda directly (no Records wrapper)
    if (!event.Records) {
        try {
            const result = await runMessage(event, integrationFactory);
            console.log(
                `Script completed: ${result.scriptName}, status: ${result.status}`
            );
            return {
                statusCode: 200,
                body: JSON.stringify({ processed: 1, results: [result] }),
            };
        } catch (error) {
            console.error(
                'Unexpected error processing scheduled invoke:',
                error
            );
            await markFailed(event.executionId, error);
            return {
                statusCode: 200,
                body: JSON.stringify({
                    processed: 1,
                    results: [
                        {
                            scriptName: event.scriptName || 'unknown',
                            status: 'FAILED',
                            error: error.message,
                        },
                    ],
                }),
            };
        }
    }

    const results = [];
    for (const record of event.Records) {
        let message = {};
        try {
            message = JSON.parse(record.body);
            const result = await runMessage(message, integrationFactory);
            console.log(
                `Script completed: ${result.scriptName}, status: ${result.status}`
            );
            results.push(result);
        } catch (error) {
            // Only unexpected failures reach here (message parse errors, runner
            // construction). Script execution errors are handled by ScriptRunner
            // and returned as { status: 'FAILED' }.
            console.error('Unexpected error processing record:', error);
            await markFailed(message.executionId, error);
            results.push({
                scriptName: message.scriptName || 'unknown',
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

module.exports = { handler };
