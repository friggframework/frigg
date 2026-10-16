/**
 * Netlify Function: Admin
 *
 * Handles /api/admin/* (netlify.toml sends the whole prefix here): the
 * app-level extension routes (appDefinition.extensions[].routes, e.g. the
 * db-credentials extension's /api/admin/oauth-credentials), each behind the
 * admin API key (x-frigg-admin-api-key / ADMIN_API_KEY). Any other
 * /api/admin path is a 404: friggframework/frigg#545 served core's
 * handlers/routers/admin here, which this core does not have.
 */
const { createAdminRouter } = require('../lib/routers');
const {
    createNetlifyAppHandler,
} = require('../lib/create-netlify-app-handler');

const handler = createNetlifyAppHandler('HTTP Event: Admin', createAdminRouter());

module.exports = { handler };
