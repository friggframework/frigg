const { Router } = require('express');
const { resolveManagementApiConfig } = require('./management-api-config');
const {
    GetManagementApiMeta,
} = require('./use-cases/get-management-api-meta');
const { isValidAdminApiKey } = require('../handlers/middleware/admin-auth');
const { version: coreVersion } = require('../package.json');

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

    return router;
}

module.exports = { createManagementApiMetaRouter };
