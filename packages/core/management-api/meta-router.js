const { Router } = require('express');
const Boom = require('@hapi/boom');
const { resolveManagementApiConfig } = require('./management-api-config');
const {
    GetManagementApiMeta,
} = require('./use-cases/get-management-api-meta');
const { isValidAdminApiKey } = require('../handlers/middleware/admin-auth');
const { version: coreVersion } = require('../package.json');
const { MANAGEMENT_API_VERSIONS } = require('./route-registry');
const { buildOpenApiDocument } = require('./openapi/build-openapi');

/**
 * Version-neutral discovery routes (ADR-053 §4, §5), mounted on the DB-free
 * health Lambda. No authentication: the admin API key only adds the core
 * version to the response.
 *
 * @param {Object} params
 * @param {Object} params.appDefinition - the loaded app definition
 *   (`managementApi` is read).
 */
function createManagementApiMetaRouter({ appDefinition = {} } = {}) {
    const config = resolveManagementApiConfig(appDefinition.managementApi);
    const getMeta = new GetManagementApiMeta({ config, coreVersion });

    const router = Router();

    router.get('/api/meta', (req, res) => {
        const isAdmin = isValidAdminApiKey(req.get('x-frigg-admin-api-key'));
        res.set('Cache-Control', 'no-store');
        res.json(getMeta.execute({ isAdmin }));
    });

    // One OpenAPI document per major (ADR-053 §5). Static per deployment, so
    // built once; the entity proxy appears only when the app enables it.
    const documents = new Map();
    for (const major of Object.keys(MANAGEMENT_API_VERSIONS)) {
        router.get(`/api/meta/openapi/v${major}.json`, (_req, res) => {
            if (!documents.has(major)) {
                documents.set(
                    major,
                    buildOpenApiDocument(major, { proxy: config.proxy.enable })
                );
            }
            res.set('Cache-Control', 'public, max-age=300');
            res.json(documents.get(major));
        });
    }

    // Anything else under /api/meta is a v2-shaped 404, not Express's page.
    router.use('/api/meta', (req, _res, next) => {
        next(Boom.notFound(`No Management API meta route for ${req.method} ${req.originalUrl.split('?')[0]}`));
    });

    return router;
}

module.exports = { createManagementApiMetaRouter };
