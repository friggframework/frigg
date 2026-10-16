/**
 * Netlify Function: User
 *
 * Handles user routes: /user/login, /user/create.
 * Wraps the existing Frigg user Express router for Netlify Functions.
 */
const { router } = require('@friggframework/core/handlers/routers/user');
const {
    createNetlifyAppHandler,
} = require('../lib/create-netlify-app-handler');

const handler = createNetlifyAppHandler('HTTP Event: User', router);

module.exports = { handler };
