/**
 * Netlify Function: Webhooks
 *
 * Handles webhook routes for all integrations:
 *   - POST /api/{integrationName}-integration/webhooks
 *   - POST /api/{integrationName}-integration/webhooks/:integrationId
 *
 * Consolidates all integration webhook handlers into a single Netlify function.
 * Webhook functions should NOT require database initialization for the handler
 * itself (shouldUseDatabase = false) — the integration instance handles its
 * own database connection when needed.
 */
const { Router } = require('express');
const { loadAppDefinition } = require('@friggframework/core/handlers/app-definition-loader');
const {
    IntegrationEventDispatcher,
} = require('@friggframework/core/handlers/integration-event-dispatcher');
const {
    createNetlifyAppHandler,
} = require('../lib/create-netlify-app-handler');

const router = Router();
const { integrations: integrationClasses } = loadAppDefinition();

for (const IntegrationClass of integrationClasses) {
    const name = IntegrationClass.Definition?.name;
    if (!name) continue;

    const basePath = `/api/${name}-integration/webhooks`;

    // General webhook route (no integration ID)
    router.post(basePath, async (req, res, next) => {
        try {
            const integrationInstance = new IntegrationClass();
            const dispatcher = new IntegrationEventDispatcher(
                integrationInstance
            );
            await dispatcher.dispatchHttp({
                event: 'WEBHOOK_RECEIVED',
                req,
                res,
                next,
            });
        } catch (error) {
            next(error);
        }
    });

    // Integration-specific webhook route (with integration ID)
    router.post(`${basePath}/:integrationId`, async (req, res, next) => {
        try {
            const integrationInstance = new IntegrationClass();
            const dispatcher = new IntegrationEventDispatcher(
                integrationInstance
            );
            await dispatcher.dispatchHttp({
                event: 'WEBHOOK_RECEIVED',
                req,
                res,
                next,
            });
        } catch (error) {
            next(error);
        }
    });
}

const handler = createNetlifyAppHandler(
    'HTTP Event: Webhooks',
    router,
    false // shouldUseDatabase
);

module.exports = { handler };
