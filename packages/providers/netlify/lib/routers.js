/**
 * Routers for the Netlify functions that have no single core router.
 *
 * Kept in the package rather than in the generated function files so the
 * function files require nothing but @friggframework/core (rewritten to the
 * backend's copy) and ../lib shims: a bare `express` or `@hapi/boom` in a
 * generated file resolves from the project root, where a pnpm workspace
 * need not have them.
 */
const Boom = require('@hapi/boom');
const { Router } = require('express');

/**
 * /api/admin/*: the app-level extension routes (appDefinition.extensions,
 * e.g. db-credentials' /api/admin/oauth-credentials), each behind the admin
 * API key; anything else under /api/admin is a v2-shaped 404.
 *
 * friggframework/frigg#545 served core's handlers/routers/admin (user and
 * global-entity administration from the integration-router-v2 branch)
 * here. That router does not exist in this core.
 */
function createAdminRouter() {
    const {
        createExtensionRoutesRouter,
    } = require('@friggframework/core/extensions/route-mounter');

    const router = Router();
    router.use(createExtensionRoutesRouter());
    router.use('/api/admin', (req, _res, next) => {
        next(
            Boom.notFound(
                `No admin route for ${req.method} ${req.originalUrl.split('?')[0]}`
            )
        );
    });
    return router;
}

/**
 * /api/docs and /api/meta*: the Management API discovery router (the one the
 * AWS health Lambda mounts), plus GET /api/docs redirecting to the current
 * OpenAPI document. #545's handlers/routers/docs does not exist in this core.
 */
function createDocsRouter() {
    const {
        loadAppDefinition,
    } = require('@friggframework/core/handlers/app-definition-loader');
    const {
        createManagementApiMetaRouter,
    } = require('@friggframework/core/management-api/meta-router');

    const router = Router();
    router.get('/api/docs', (_req, res) =>
        res.redirect(302, '/api/meta/openapi/v2.json')
    );
    router.use(
        createManagementApiMetaRouter({ appDefinition: loadAppDefinition() })
    );
    return router;
}

module.exports = { createAdminRouter, createDocsRouter };
