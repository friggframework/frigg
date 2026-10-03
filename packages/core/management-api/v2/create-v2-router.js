const express = require('express');
const Boom = require('@hapi/boom');
const catchAsyncError = require('express-async-handler');
const { API_VERSION_HEADER } = require('../error-response');
const { listV2Routes } = require('../route-registry');
const { resolveManagementApiConfig } = require('../management-api-config');
const { createIntegrationHandlers } = require('./handlers/integrations');
const { createEntityHandlers } = require('./handlers/entities');
const { createCredentialHandlers } = require('./handlers/credentials');
const { createAuthorizationHandlers } = require('./handlers/authorization');

/** Every v2 handler, keyed by the registry's operationId. */
function createV2Handlers(dependencies) {
    return {
        ...createIntegrationHandlers(dependencies),
        ...createEntityHandlers(dependencies),
        ...createCredentialHandlers(dependencies),
        ...createAuthorizationHandlers(dependencies),
    };
}

/**
 * Management API v2 router (ADR-053). Routes come from the registry, in
 * registry order; each authenticates the caller with the same
 * AuthenticateUser as v1 (bearer token, x-frigg headers, adopter JWT) and then
 * runs the handler for its operationId. Every response under /api/v2 carries
 * `Frigg-API-Version: 2`; an unknown /api/v2 path is a v2 404.
 *
 * @param {Object} [params]
 * @param {Object} [params.appDefinition]
 * @param {Object} [params.config] - resolveManagementApiConfig() output.
 * @param {Object} [params.dependencies] - use cases and authenticateUser;
 *   built from the app definition when omitted.
 */
function createManagementApiV2Router({
    appDefinition = {},
    config,
    dependencies,
} = {}) {
    const resolvedConfig =
        config || resolveManagementApiConfig(appDefinition.managementApi);
    const deps =
        dependencies ||
        require('./dependencies').buildV2Dependencies({
            appDefinition,
            config: resolvedConfig,
        });
    const handlers = createV2Handlers(deps);

    const router = express.Router();

    router.use('/api/v2', (_req, res, next) => {
        res.set(API_VERSION_HEADER, '2');
        next();
    });

    for (const route of listV2Routes({ proxy: resolvedConfig.proxy.enable })) {
        const handler = handlers[route.operationId];
        if (!handler) continue;
        router[route.method.toLowerCase()](
            route.path,
            catchAsyncError(async (req, res) => {
                const user = await deps.authenticateUser.execute(req);
                if (!user) throw Boom.unauthorized('Authentication required');
                await handler(req, res, user);
            })
        );
    }

    router.use('/api/v2', (req, _res, next) => {
        next(
            Boom.notFound(
                `No Management API v2 route for ${req.method} ${req.baseUrl}${req.path}`
            )
        );
    });

    return router;
}

module.exports = { createManagementApiV2Router, createV2Handlers };
