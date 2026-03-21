/**
 * Netlify Function: Health
 *
 * Handles health check routes: /health/*, including:
 *   - GET /health/live - Liveness check
 *   - GET /health/ready - Readiness check (database, modules)
 *   - GET /health/detailed - Detailed health with encryption, VPC, diagnostics
 */
const { router } = require('@friggframework/core/handlers/routers/health');
const {
    createNetlifyAppHandler,
} = require('../lib/create-netlify-app-handler');

const handler = createNetlifyAppHandler('HTTP Event: Health', router);

module.exports = { handler };
