const { createAppHandler } = require('./../app-handler-helpers');
const { loadAppDefinition } = require('../app-definition-loader');
const { Router } = require('express');
const { runInContext, LOGGER_SCOPE_KEY } = require('../../logs/context');
const {
    IntegrationEventDispatcher,
} = require('../integration-event-dispatcher');

// `webhooks.received` is counted at the DB-connected ON_WEBHOOK dispatch (see
// usage-rollup-subscriber), not in this DB-free receipt handler.

/**
 * Builds the webhook receiver router for every integration with webhooks
 * enabled. Pure: no handler wrapping, so the AWS handlers below and other
 * hosts (provider-netlify's webhooks function) mount the same routers.
 *
 * @param {Array<Function>} integrationClasses
 * @returns {Array<{ key: string, eventName: string, router: import('express').Router }>}
 */
function buildWebhookRouters(integrationClasses) {
    const entries = [];
    for (const IntegrationClass of integrationClasses) {
        const webhookConfig = IntegrationClass.Definition.webhooks;

        // Skip if webhooks not enabled
        if (
            !webhookConfig ||
            (typeof webhookConfig === 'object' && !webhookConfig.enabled)
        ) {
            continue;
        }

        const router = Router();
        const basePath = `/api/${IntegrationClass.Definition.name}-integration/webhooks`;

        console.log(
            `\n│ Configuring webhook routes for ${IntegrationClass.Definition.name}:`
        );

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
        console.log(`│ POST ${basePath}`);

        // Integration-specific webhook route (with integration ID)
        router.post(`${basePath}/:integrationId`, async (req, res, next) => {
            try {
                const integrationInstance = new IntegrationClass();
                const dispatcher = new IntegrationEventDispatcher(
                    integrationInstance
                );
                // Logs only: the id comes from an unauthenticated URL, so it must
                // not reach the telemetry context that drives usage attribution.
                await runInContext(
                    {
                        [LOGGER_SCOPE_KEY]: {
                            integrationId: req.params.integrationId,
                        },
                    },
                    () =>
                        dispatcher.dispatchHttp({
                            event: 'WEBHOOK_RECEIVED',
                            req,
                            res,
                            next,
                        })
                );
            } catch (error) {
                next(error);
            }
        });
        console.log(`│ POST ${basePath}/:integrationId`);
        console.log('│');

        entries.push({
            key: `${IntegrationClass.Definition.name}Webhook`,
            eventName: `HTTP Event: ${IntegrationClass.Definition.name} Webhook`,
            router,
        });
    }
    return entries;
}

/**
 * One router serving every integration's webhook routes, for hosts that run
 * them all in one function (provider-netlify).
 *
 * @param {Array<Function>} [integrationClasses] - defaults to the app's.
 * @returns {import('express').Router}
 */
function createWebhookRouter(integrationClasses) {
    const classes = integrationClasses || loadAppDefinition().integrations;
    const combined = Router();
    for (const entry of buildWebhookRouters(classes)) {
        combined.use(entry.router);
    }
    return combined;
}

const handlers = {};
for (const entry of buildWebhookRouters(loadAppDefinition().integrations)) {
    handlers[entry.key] = {
        handler: createAppHandler(
            entry.eventName,
            entry.router,
            false // shouldUseDatabase = false
        ),
    };
}

module.exports = { handlers, buildWebhookRouters, createWebhookRouter };
