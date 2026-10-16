/**
 * Netlify Function: Auth & Management API
 *
 * Serves core's handlers/routers/auth router, the same router as the AWS
 * auth Lambda:
 *   - the Management API v2 under /api/v2 (adopter-JWT / x-frigg / shared
 *     secret auth, the entity registry, memberships, ownership and roles,
 *     credentials, the entity proxy and its scopes)
 *   - the deprecated v1 at the unprefixed paths, or 410 with managementApi.v1: false
 *   - the OAuth redirect /api/integrations/redirect/:appId
 *   - app-level extension routes, behind the admin API key
 *
 * Auth and configuration come from the app definition preset by the
 * generated preamble, resolved by core's loadAppDefinition exactly as on AWS.
 */
const { router } = require('@friggframework/core/handlers/routers/auth');
const {
    createNetlifyAppHandler,
} = require('../lib/create-netlify-app-handler');

const handler = createNetlifyAppHandler('HTTP Event: Auth & Integrations', router);

module.exports = { handler };
