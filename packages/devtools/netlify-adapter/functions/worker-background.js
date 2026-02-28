/**
 * Netlify Background Function: Queue Worker
 *
 * Processes async jobs dispatched by the queue provider.
 * Named with '-background' suffix so Netlify runs it as a Background Function
 * (15-minute execution limit, returns 202 immediately).
 *
 * Supports all three queue provider event formats:
 * - Netlify Background Function: HTTP POST body
 * - QStash: HTTP POST body (same format, different delivery mechanism)
 * - SQS (for local dev): event.Records[].body
 *
 * Message format expected:
 * {
 *   "integrationName": "hubspot",
 *   "event": "PROCESS_BATCH",
 *   "data": { "processId": "abc123", ... }
 * }
 */
const { loadAppDefinition } = require('@friggframework/core/handlers/app-definition-loader');
const { createQueueWorker } = require('@friggframework/core/handlers/backend-utils');
const { createQueueProvider } = require('@friggframework/core/queues');
const { createNetlifyHandler } = require('../lib/create-netlify-handler');

const { integrations: integrationClasses } = loadAppDefinition();

// Build a map of integration name → QueueWorker class
const workerMap = {};
for (const IntegrationClass of integrationClasses) {
    const name = IntegrationClass.Definition.name;
    workerMap[name] = createQueueWorker(IntegrationClass);
}

const queueProvider = createQueueProvider();

const handler = createNetlifyHandler({
    eventName: 'Queue Worker (Netlify Background)',
    isUserFacingResponse: false,
    method: async (event, context) => {
        // Parse the event using the active queue provider
        const messages = queueProvider.parseEvent(event);

        for (const message of messages) {
            const { integrationName, event: jobEvent, data } = message;

            const WorkerClass = workerMap[integrationName];
            if (!WorkerClass) {
                console.error(
                    `No worker found for integration: ${integrationName}. Available: ${Object.keys(workerMap).join(', ')}`
                );
                continue;
            }

            const worker = new WorkerClass();
            // Call _run directly (bypasses SQS-specific event.Records parsing in run())
            await worker._run({ event: jobEvent, data }, context);
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                message: `Processed ${messages.length} message(s)`,
            }),
        };
    },
});

module.exports = { handler };
