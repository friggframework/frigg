/**
 * Netlify Function: Health
 *
 * Serves core's handlers/routers/health router, as the AWS health Lambda:
 *   - GET /health, /health/live, /health/ready, /health/detailed
 *   - GET /api/meta and /api/meta/openapi/v{n}.json (Management API discovery)
 *
 * DB-free like the AWS handler: /health/ready probes the database itself and
 * degrades to 503, where an eager connect would turn an outage into a 500.
 */
const { router } = require('@friggframework/core/handlers/routers/health');
const {
    createNetlifyAppHandler,
} = require('../lib/create-netlify-app-handler');

const handler = createNetlifyAppHandler('HTTP Event: Health', router, false);

module.exports = { handler };
