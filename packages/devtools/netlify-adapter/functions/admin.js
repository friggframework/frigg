/**
 * Netlify Function: Admin
 *
 * Handles admin routes: /api/admin/*
 * Protected by admin API key authentication.
 */
const { router } = require('@friggframework/core/handlers/routers/admin');
const {
    createNetlifyAppHandler,
} = require('../lib/create-netlify-app-handler');

const handler = createNetlifyAppHandler('HTTP Event: Admin', router);

module.exports = { handler };
