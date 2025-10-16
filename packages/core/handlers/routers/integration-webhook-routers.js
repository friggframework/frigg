const { createAppHandler } = require('./../app-handler-helpers');
const { loadAppDefinition } = require('../app-definition-loader');
const { Router } = require('express');
const { IntegrationEventDispatcher } = require('../integration-event-dispatcher');

const handlers = {};
const { integrations: integrationClasses } = loadAppDefinition();

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
    router.post('/', async (req, res, next) => {
        try {
            const integrationInstance = new IntegrationClass();
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
    router.post('/:integrationId', async (req, res, next) => {
        try {
            const integrationInstance = new IntegrationClass();
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

