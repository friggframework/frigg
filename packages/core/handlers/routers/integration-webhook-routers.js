const { createAppHandler } = require('./../app-handler-helpers');
const { loadAppDefinition } = require('../app-definition-loader');
const { Router } = require('express');
const { runInContext, LOGGER_SCOPE_KEY } = require('../../logs/context');
const {
    IntegrationEventDispatcher,
} = require('../integration-event-dispatcher');

const handlers = {};
const { integrations: integrationClasses } = loadAppDefinition();

// `webhooks.received` is counted at the DB-connected ON_WEBHOOK dispatch (see
// usage-rollup-subscriber), not in this DB-free receipt handler.

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
    const receive = async (req, res, next, integrationId) => {
        try {
            const dispatcher = new IntegrationEventDispatcher(new IntegrationClass());
            const dispatch = () => dispatcher.dispatchHttp({ event: 'WEBHOOK_RECEIVED', req, res, next });
            // Logs only: the id comes from an unauthenticated URL, so it must not reach the telemetry context that
            // drives usage attribution.
            await (integrationId ? runInContext({ [LOGGER_SCOPE_KEY]: { integrationId } }, dispatch) : dispatch());
        } catch (error) {
            next(error);
        }
    };
    const basePath = `/api/${IntegrationClass.Definition.name}-integration/webhooks`;

    console.log(
        `\n│ Configuring webhook routes for ${IntegrationClass.Definition.name}:`
    );

    // General webhook route (no integration ID)
    router.post(basePath, (req, res, next) => receive(req, res, next));
    console.log(`│ POST ${basePath}`);

    // Integration-specific webhook route (with integration ID)
    router.post(`${basePath}/:integrationId`, (req, res, next) => receive(req, res, next, req.params.integrationId));
    console.log(`│ POST ${basePath}/:integrationId`);

    // A provider (the shared runtime for published integration definitions) also receives the webhooks of every
    // type it provides, at each type's own URL. Receipt has no database, so the type in the URL is not looked up
    // here: the delivery is queued on this deployment and the worker hydrates the installation by its id.
    if (IntegrationClass.IntegrationProvider) {
        const providedPath = '/api/:integrationType/webhooks';
        // Registered integrations keep their own routes (a local server mounts every router on one app).
        const registered = new Set(integrationClasses.map((c) => `${c.Definition.name}-integration`));
        const isProvidedPath = (req) => /^[A-Za-z0-9_.-]+-integration$/.test(req.params.integrationType || '') && !registered.has(req.params.integrationType);
        router.post(providedPath, (req, res, next) => (isProvidedPath(req) ? receive(req, res, next) : next()));
        router.post(`${providedPath}/:integrationId`, (req, res, next) => (isProvidedPath(req) ? receive(req, res, next, req.params.integrationId) : next()));
        console.log(`│ POST /api/<provided type>-integration/webhooks[/:integrationId]`);
    }
    console.log('│');

    handlers[`${IntegrationClass.Definition.name}Webhook`] = {
        handler: createAppHandler(
            `HTTP Event: ${IntegrationClass.Definition.name} Webhook`,
            router,
            false // shouldUseDatabase = false
        ),
    };
}

module.exports = { handlers };
