/**
 * Netlify Function: Docs
 *
 * Serves the Management API's discovery routes, the router the AWS health
 * Lambda mounts:
 *   - GET /api/meta                    - versions and deprecation state
 *   - GET /api/meta/openapi/v{n}.json  - one OpenAPI document per major
 * and GET /api/docs, redirecting to the current OpenAPI document.
 * (friggframework/frigg#545's handlers/routers/docs does not exist in this core.)
 */
const { createDocsRouter } = require('../lib/routers');
const {
    createNetlifyAppHandler,
} = require('../lib/create-netlify-app-handler');

const handler = createNetlifyAppHandler('HTTP Event: Docs', createDocsRouter(), false);

module.exports = { handler };
