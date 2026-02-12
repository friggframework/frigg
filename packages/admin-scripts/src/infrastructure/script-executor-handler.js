const { createScriptRunner } = require('../application/script-runner');

/**
 * SQS Queue Worker Lambda Handler
 *
 * Processes script execution messages from AdminScriptQueue.
 * Thin adapter: parses SQS messages and delegates to ScriptRunner.
 * ScriptRunner handles execution tracking, error recording, and status updates.
 */
async function handler(event) {
    const results = [];

    for (const record of event.Records) {
        let scriptName;

        try {
            const message = JSON.parse(record.body);
            ({ scriptName } = message);
            const { executionId, trigger, params } = message;

            if (!scriptName || !executionId) {
                throw new Error(`Invalid SQS message: missing scriptName or executionId`);
            }

            console.log(`Processing script: ${scriptName}, executionId: ${executionId}`);

            const runner = createScriptRunner();
            const result = await runner.execute(scriptName, params, {
                trigger: trigger || 'QUEUE',
                mode: 'async',
                executionId,
            });

            console.log(`Script completed: ${scriptName}, status: ${result.status}`);
            results.push({
                scriptName,
                status: result.status,
                executionId: result.executionId,
            });
        } catch (error) {
            // Only reaches here for unexpected failures (message parse errors, runner construction).
            // Script execution errors are handled by ScriptRunner and returned as { status: 'FAILED' }.
            console.error(`Unexpected error processing record:`, error);
            results.push({
                scriptName: scriptName || 'unknown',
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
