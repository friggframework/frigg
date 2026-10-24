/**
 * Netlify Function: Webhooks
 *
 * Receives integration webhooks for every integration with
 * Definition.webhooks enabled:
 *   - POST /api/{integrationName}-integration/webhooks
 *   - POST /api/{integrationName}-integration/webhooks/:integrationId
 *
 * The router is core's integration-webhook-routers builder, the one the AWS
 * webhook Lambdas use. Like them it runs without a database connection:
 * WEBHOOK_RECEIVED handlers verify and enqueue, and the integration
 * connects when it needs to. An integration without webhooks enabled gets
 * a 404, as on AWS (friggframework/frigg#545 dispatched for every
 * integration).
 */
const {
    createWebhookRouter,
} = require('@friggframework/core/handlers/routers/integration-webhook-routers');
const {
    createNetlifyAppHandler,
} = require('../lib/create-netlify-app-handler');

const handler = createNetlifyAppHandler(
    'HTTP Event: Webhooks',
    createWebhookRouter(),
    false // shouldUseDatabase
);

module.exports = { handler };
