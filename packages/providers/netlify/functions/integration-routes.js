/**
 * Netlify Function: Integration-Defined Routes
 *
 * Serves every integration's Definition.routes and Tier 3 extension
 * bindings, mounted at /api/{integrationName}-integration/*. The routers come
 * from core's integration-defined-routers builder, the one the AWS
 * per-integration Lambdas use, so route conflicts are rejected the same way.
 *
 * On AWS each integration (and each extension binding) gets its own Lambda;
 * on Netlify they share this one function.
 */
const {
    createIntegrationDefinedRouter,
} = require('@friggframework/core/handlers/routers/integration-defined-routers');
const {
    createNetlifyAppHandler,
} = require('../lib/create-netlify-app-handler');

const handler = createNetlifyAppHandler(
    'HTTP Event: Integration Routes',
    createIntegrationDefinedRouter()
);

module.exports = { handler };
