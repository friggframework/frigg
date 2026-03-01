/**
 * Netlify Function: Docs
 *
 * Handles API documentation routes:
 *   - GET /api/docs - v1 OpenAPI documentation
 *   - GET /api/v2/docs - v2 OpenAPI documentation
 */
const { router } = require('@friggframework/core/handlers/routers/docs');
const {
    createNetlifyAppHandler,
} = require('../lib/create-netlify-app-handler');

const handler = createNetlifyAppHandler('HTTP Event: Docs', router, false);

module.exports = { handler };
