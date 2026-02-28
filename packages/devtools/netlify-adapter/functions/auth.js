/**
 * Netlify Function: Auth
 *
 * Handles authentication routes: /api/authorize, /api/credentials, OAuth callbacks.
 * Wraps the existing Frigg auth Express router for Netlify Functions.
 */
const { router } = require('@friggframework/core/handlers/routers/auth');
const {
    createNetlifyAppHandler,
} = require('../lib/create-netlify-app-handler');

const handler = createNetlifyAppHandler('HTTP Event: Auth', router);

module.exports = { handler };
