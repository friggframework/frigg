/**
 * Netlify Background Function: Queue Worker
 *
 * Processes async jobs dispatched by the queue provider. The '-background'
 * suffix makes Netlify run it as a Background Function (15-minute limit,
 * 202 returned immediately).
 *
 * Message format:
 * {
 *   "integrationName": "hubspot",
 *   "event": "PROCESS_BATCH",
 *   "data": { "processId": "abc123", ... }
 * }
 *
 * Each message runs through core's createQueueWorker, the same worker the
 * AWS queue Lambdas use, built with the app's offered module definitions
 * (the entity registry) exactly as integration-defined-workers does. The
 * queue provider defaults to Netlify Background Functions; QUEUE_PROVIDER
 * or appDefinition.queue.provider ('qstash') select another HTTP queue.
 *
 * Security: this function is reachable over HTTP by anyone who knows its
 * path (and /api/queue if the netlify.toml redirect is kept), and Netlify
 * does not authenticate the caller. So every event must carry a signature:
 * Frigg's own HMAC (FRIGG_QUEUE_SIGNING_SECRET, sent by
 * NetlifyBackgroundProvider) or, with the qstash provider, a valid
 * Upstash-Signature. An unverified event is answered 401 (the caller still
 * sees Netlify's 202) and logs one WARN, frigg.netlify.queue.rejected; it is
 * not parsed, connects no database and dispatches nothing. Without a secret
 * every event is refused, unless FRIGG_QUEUE_ALLOW_UNSIGNED=true outside
 * production (lib/queue-event-auth.js).
 */
const {
    loadAppDefinition,
} = require('@friggframework/core/handlers/app-definition-loader');
const { createQueueWorker } = require('@friggframework/core/handlers/backend-utils');
const { createQueueProvider } = require('@friggframework/core/queues');
const { createNetlifyHandler } = require('../lib/create-netlify-handler');
const {
    createQueueEventVerifier,
    withQueueEventAuth,
} = require('../lib/queue-event-auth');

const loaded = loadAppDefinition();
const { integrations: integrationClasses, moduleDefinitions } = loaded;

// Build a map of integration name → QueueWorker class
const workerMap = {};
for (const IntegrationClass of integrationClasses) {
    const name = IntegrationClass.Definition.name;
    workerMap[name] = createQueueWorker(IntegrationClass, { moduleDefinitions });
}

const queueProvider = createQueueProvider({
    appDefinition: loaded.appDefinition,
    provider: process.env.QUEUE_PROVIDER || loaded.appDefinition?.queue?.provider || 'netlify-background',
});

const processQueueEvent = createNetlifyHandler({
    eventName: 'Queue Worker (Netlify Background)',
    isUserFacingResponse: false,
    method: async (event, context) => {
        const messages = queueProvider.parseEvent(event);

        for (const message of messages) {
            const { integrationName, event: jobEvent, data } = message || {};

            const WorkerClass = workerMap[integrationName];
            if (!WorkerClass) {
                console.error(
                    `No worker found for integration: ${integrationName}. Available: ${Object.keys(workerMap).join(', ')}`
                );
                continue;
            }

            const worker = new WorkerClass();
            // _run directly: run() parses SQS event.Records.
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

const handler = withQueueEventAuth({
    handler: processQueueEvent,
    verify: createQueueEventVerifier({ queueProvider }),
});

module.exports = { handler };
