const express = require('express');
const { resolveManagementApiConfig } = require('./management-api-config');
const {
    createV1DeprecationRouter,
    createV1DisabledRouter,
} = require('./v1-deprecation');

/**
 * The Management API served by the auth Lambda (ADR-053): v2 under /api/v2
 * and the frozen, deprecated v1 at the unprefixed paths. With
 * `managementApi.v1: false` the v1 handlers are never built and the v1 paths
 * answer 410.
 *
 * @param {Object} [params]
 * @param {Object} [params.appDefinition] - defaults to loadAppDefinition().
 * @param {Function} [params.createV1Router] - defaults to createIntegrationRouter.
 * @param {Function} [params.createV2Router] - defaults to createManagementApiV2Router.
 */
function createManagementApiRouter({
    appDefinition,
    createV1Router,
    createV2Router,
} = {}) {
    const definition =
        appDefinition ||
        require('../handlers/app-definition-loader').loadAppDefinition();
    const config = resolveManagementApiConfig(definition.managementApi);

    const buildV1 =
        createV1Router ||
        require('../integrations/integration-router').createIntegrationRouter;
    const buildV2 =
        createV2Router ||
        require('./v2/create-v2-router').createManagementApiV2Router;

    const router = express.Router();
    router.use(buildV2({ appDefinition: definition, config }));

    if (config.v1) {
        router.use(createV1DeprecationRouter());
        router.use(buildV1());
    } else {
        router.use(createV1DisabledRouter());
    }

    return router;
}

module.exports = { createManagementApiRouter };
