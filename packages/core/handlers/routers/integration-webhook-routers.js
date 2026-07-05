const { createAppHandler } = require('./../app-handler-helpers');
const { loadAppDefinition } = require('../app-definition-loader');
const { Router } = require('express');
const { IntegrationEventDispatcher } = require('../integration-event-dispatcher');

const handlers = {};
const { integrations: integrationClasses } = loadAppDefinition();

/**
 * Emit the canonical `webhooks.received` usage signal (ADR-011). Counted at the
 * receipt seam where the instance is still dry (no integrationId), so this is
 * integration_type-scoped only — per-integration webhook processing is counted
 * downstream at the (post-hydration) queue dispatch. Fully guarded: a telemetry
 * failure must never break webhook receipt.
 */
function recordWebhookReceived(integrationInstance, IntegrationClass) {
    try {
        integrationInstance.telemetry?.count?.('frigg.webhooks.received', 1, {
            integration_type: IntegrationClass.Definition?.name || 'unknown',
        });
    } catch (_) {
        // never break the webhook path
    }
}

for (const IntegrationClass of integrationClasses) {
    const webhookConfig = IntegrationClass.Definition.webhooks;

    // Skip if webhooks not enabled
    if (!webhookConfig || (typeof webhookConfig === 'object' && !webhookConfig.enabled)) {
        continue;
    }

    const router = Router();
    const basePath = `/api/${IntegrationClass.Definition.name}-integration/webhooks`;

    console.log(`\n│ Configuring webhook routes for ${IntegrationClass.Definition.name}:`);

    // General webhook route (no integration ID)
    router.post(basePath, async (req, res, next) => {
        try {
            const integrationInstance = new IntegrationClass();
            recordWebhookReceived(integrationInstance, IntegrationClass);
            const dispatcher = new IntegrationEventDispatcher(integrationInstance);
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
    console.log(`│ POST ${basePath}`);

    // Integration-specific webhook route (with integration ID)
    router.post(`${basePath}/:integrationId`, async (req, res, next) => {
        try {
            const integrationInstance = new IntegrationClass();
            recordWebhookReceived(integrationInstance, IntegrationClass);
            const dispatcher = new IntegrationEventDispatcher(integrationInstance);
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
    console.log(`│ POST ${basePath}/:integrationId`);
    console.log('│');

    handlers[`${IntegrationClass.Definition.name}Webhook`] = {
        handler: createAppHandler(
            `HTTP Event: ${IntegrationClass.Definition.name} Webhook`,
            router,
            false  // shouldUseDatabase = false
        ),
    };
}

module.exports = { handlers };

