const { createScriptRunner } = require('../application/script-runner');
const {
    createAdminScriptCommands,
} = require('@friggframework/core/application/commands/admin-script-commands');
const { bootstrapAdminScripts } = require('./bootstrap');

/**
 * Run a single execution message through the ScriptRunner.
 * @param {Object} message - Parsed execution message.
 * @param {string} message.scriptName - Name of the registered script to run (required).
 * @param {string} [message.executionId] - Existing AdminProcess id to resume; when
 *   absent, ScriptRunner creates a new record.
 * @param {string} [message.trigger] - Execution trigger; defaults to 'QUEUE'.
 * @param {Object} [message.params] - Parameters passed to the script.
 * @param {string} [message.parentExecutionId] - Parent execution id for queueScript continuations.
 * @param {Object} deps
 * @param {ScriptFactory} deps.scriptFactory - Registry used to resolve and instantiate the script.
 * @param {Object} deps.integrationFactory - Hydrates integration instances for scripts that need them.
 * @returns {Promise<{ scriptName: string, status: string, executionId: string }>}
 * @private
 */
async function runMessage(message, { scriptFactory, integrationFactory }) {
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

    const runner = createScriptRunner({ scriptFactory, integrationFactory });
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
 * Handle an EventBridge Scheduler direct invoke: the event itself is a single
 * execution message (no `Records` wrapper).
 * @param {Object} event - The execution message.
 * @param {{ scriptFactory: ScriptFactory, integrationFactory: object }} deps
 * @returns {Promise<{ statusCode: number, body: string }>}
 * @private
 */
async function handleScheduledInvoke(event, deps) {
    try {
        const result = await runMessage(event, deps);
        console.log(
            `Script completed: ${result.scriptName}, status: ${result.status}`
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
                        scriptName: event.scriptName || 'unknown',
                        status: 'FAILED',
                        error: error.message,
                    },
                ],
            }),
        };
    }
}

/**
 * Handle an SQS batch: each `event.Records[].body` is a JSON execution message
 * (manual async executions and queueScript continuations). Failures are isolated
 * per record so one bad message doesn't drop the rest of the batch.
 * @param {Object} event - The SQS event with a `Records` array.
 * @param {{ scriptFactory: ScriptFactory, integrationFactory: object }} deps
 * @returns {Promise<{ statusCode: number, body: string }>}
 * @private
 */
async function handleSqsBatch(event, deps) {
    const results = [];
    for (const record of event.Records) {
        let message = {};
        try {
            message = JSON.parse(record.body);
            const result = await runMessage(message, deps);
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
    const deps = bootstrapAdminScripts();

    return event.Records
        ? handleSqsBatch(event, deps)
        : handleScheduledInvoke(event, deps);
}

module.exports = { handler };
