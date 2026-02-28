/**
 * @friggframework/netlify-adapter
 *
 * Netlify deployment adapter for the Frigg Framework.
 *
 * This package provides:
 * - Netlify Function entry points (split per concern)
 * - Netlify handler wrapper (create-netlify-handler)
 * - netlify.toml generator from Frigg app definition
 * - Netlify DB (Neon PostgreSQL) validation
 * - Queue worker background function
 * - Scheduled function for cron-based dispatching
 *
 * Usage:
 *   const { generateNetlifyToml } = require('@friggframework/netlify-adapter');
 *   const toml = generateNetlifyToml(appDefinition);
 */
const { createNetlifyHandler } = require('./lib/create-netlify-handler');
const {
    createNetlifyApp,
    createNetlifyAppHandler,
} = require('./lib/create-netlify-app-handler');
const {
    generateNetlifyToml,
    generateNetlifyEnvTemplate,
} = require('./lib/generate-netlify-config');
const { validateNetlifyDbConfig } = require('./lib/netlify-db');

module.exports = {
    // Handler utilities
    createNetlifyHandler,
    createNetlifyApp,
    createNetlifyAppHandler,

    // Configuration generation
    generateNetlifyToml,
    generateNetlifyEnvTemplate,

    // Validation
    validateNetlifyDbConfig,
};
