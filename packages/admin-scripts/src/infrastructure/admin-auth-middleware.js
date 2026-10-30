/**
 * Admin API Key Authentication Middleware
 *
 * Re-exports shared admin auth middleware from @friggframework/core.
 * Uses simple ENV-based API key validation.
 * Expects: x-frigg-admin-api-key header
 */

const {
    validateAdminApiKey,
} = require('@friggframework/core/handlers/middleware/admin-auth');

module.exports = { validateAdminApiKey };
