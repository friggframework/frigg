/**
 * Netlify Function: Auth & Integrations
 *
 * Handles the core Frigg integration router which includes:
 *   - v1: /api/integrations, /api/authorize, /api/credentials, /api/entities
 *   - v2: /api/v2/integrations, /api/v2/authorize, /api/v2/credentials, /api/v2/entities
 *   - OAuth redirect: /api/integrations/redirect/:appId
 *   - Integration settings: /config/integration-settings
 *
 * The auth router uses createIntegrationRouter() which mounts all integration
 * API routes (both v1 and v2). This is the primary API function for Frigg on Netlify.
 */
const { router } = require('@friggframework/core/handlers/routers/auth');
const {
    createNetlifyAppHandler,
} = require('../lib/create-netlify-app-handler');

const handler = createNetlifyAppHandler('HTTP Event: Auth & Integrations', router);

module.exports = { handler };
