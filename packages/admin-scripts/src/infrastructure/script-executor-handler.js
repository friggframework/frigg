const { createScriptRunner } = require('../application/script-runner');
const { createAdminScriptCommands } = require('@friggframework/core/application/commands/admin-script-commands');

/**
 * SQS Queue Worker Lambda Handler
 *
 * Processes script execution messages from AdminScriptQueue
 */
async function handler(event) {
    const results = [];

    for (const record of event.Records) {
        const message = JSON.parse(record.body);
        const { scriptName, executionId, trigger, params } = message;

        console.log(`Processing script: ${scriptName}, executionId: ${executionId}`);

        try {
            const runner = createScriptRunner();
            const commands = createAdminScriptCommands();

            // If executionId provided (async from API), update existing record
            if (executionId) {
                await commands.updateAdminProcessState(executionId, 'RUNNING');
            }

            const result = await runner.execute(scriptName, params, {
                trigger: trigger || 'QUEUE',
                mode: 'async',
                executionId, // Reuse existing if provided
            });

            console.log(
                `Script completed: ${scriptName}, status: ${result.status}`
            );
            results.push({
                scriptName,
                status: result.status,
                executionId: result.executionId,
            });
        } catch (error) {
            console.error(`Script failed: ${scriptName}`, error);

            // Try to update execution status if we have an ID
            if (executionId) {
                const commands = createAdminScriptCommands();
                await commands
                    .completeAdminProcess(executionId, {
                        state: 'FAILED',
                        error: {
                            name: error.name,
                            message: error.message,
                            stack: error.stack,
                        },
                    })
                    .catch((e) =>
                        console.error('Failed to update execution:', e)
                    );
            }

            results.push({
                scriptName,
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
