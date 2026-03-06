/**
 * Netlify Configuration Generator
 *
 * Generates netlify.toml from a Frigg app definition.
 * Produces routing redirects for split-per-concern Netlify Functions,
 * including v2 API routes.
 *
 * Usage:
 *   const { generateNetlifyToml } = require('@friggframework/provider-netlify');
 *   const toml = generateNetlifyToml(appDefinition);
 *   fs.writeFileSync('netlify.toml', toml);
 */

/**
 * Generate netlify.toml content from a Frigg app definition
 *
 * @param {Object} appDefinition - Frigg app definition object
 * @param {Object} [options]
 * @param {string} [options.functionsDir] - Functions directory (default: 'netlify/functions')
 * @param {string} [options.buildCommand] - Build command (default: 'npm run build')
 * @param {string} [options.nodeVersion] - Node.js version (default: '18')
 * @returns {string} netlify.toml content
 */
function generateNetlifyToml(appDefinition, options = {}) {
    const {
        functionsDir = 'netlify/functions',
        buildCommand = 'npm run build',
        nodeVersion = '18',
        cronSchedule = '*/5 * * * *',
    } = options;

    const integrations = appDefinition.integrations || [];

    const lines = [];

    // Build configuration
    lines.push('[build]');
    lines.push(`  command = "${buildCommand}"`);
    lines.push(`  functions = "${functionsDir}"`);
    lines.push('');

    // Node version
    lines.push('[build.environment]');
    lines.push(`  NODE_VERSION = "${nodeVersion}"`);
    lines.push('');

    // Functions configuration
    lines.push('[functions]');
    lines.push('  node_bundler = "esbuild"');
    lines.push('  # Include Prisma client (binary, not traceable by nft)');
    lines.push('  included_files = ["node_modules/.prisma/**"]');
    lines.push('  # Exclude packages that esbuild cannot bundle (native/dynamic requires)');
    lines.push('  external_node_modules = ["express", "body-parser", "cors", "serverless-http", "@prisma/client", "mongoose", "@friggframework/core", "@friggframework/provider-netlify"]');
    lines.push('');

    // =========================================================================
    // Redirects — route API requests to split Netlify Functions
    // =========================================================================

    // Auth & Integration API (v1 + v2) — the main API function
    // v2 routes
    lines.push('# v2 API routes');
    lines.push('[[redirects]]');
    lines.push('  from = "/api/v2/*"');
    lines.push('  to = "/.netlify/functions/auth"');
    lines.push('  status = 200');
    lines.push('');

    // v1 integration routes
    lines.push('# v1 integration/auth routes');
    lines.push('[[redirects]]');
    lines.push('  from = "/api/integrations/*"');
    lines.push('  to = "/.netlify/functions/auth"');
    lines.push('  status = 200');
    lines.push('');

    lines.push('[[redirects]]');
    lines.push('  from = "/api/authorize"');
    lines.push('  to = "/.netlify/functions/auth"');
    lines.push('  status = 200');
    lines.push('');

    lines.push('[[redirects]]');
    lines.push('  from = "/api/credentials/*"');
    lines.push('  to = "/.netlify/functions/auth"');
    lines.push('  status = 200');
    lines.push('');

    lines.push('[[redirects]]');
    lines.push('  from = "/api/entities/*"');
    lines.push('  to = "/.netlify/functions/auth"');
    lines.push('  status = 200');
    lines.push('');

    lines.push('[[redirects]]');
    lines.push('  from = "/config/integration-settings"');
    lines.push('  to = "/.netlify/functions/auth"');
    lines.push('  status = 200');
    lines.push('');

    // User routes
    lines.push('# User routes');
    lines.push('[[redirects]]');
    lines.push('  from = "/user/*"');
    lines.push('  to = "/.netlify/functions/user"');
    lines.push('  status = 200');
    lines.push('');

    // Health routes
    lines.push('# Health check routes');
    lines.push('[[redirects]]');
    lines.push('  from = "/health/*"');
    lines.push('  to = "/.netlify/functions/health"');
    lines.push('  status = 200');
    lines.push('');

    // Admin routes
    lines.push('# Admin routes');
    lines.push('[[redirects]]');
    lines.push('  from = "/api/admin/*"');
    lines.push('  to = "/.netlify/functions/admin"');
    lines.push('  status = 200');
    lines.push('');

    // Docs routes
    lines.push('# API documentation routes');
    lines.push('[[redirects]]');
    lines.push('  from = "/api/docs"');
    lines.push('  to = "/.netlify/functions/docs"');
    lines.push('  status = 200');
    lines.push('');

    // Integration-defined routes (per integration)
    if (integrations.length > 0) {
        lines.push('# Integration-defined custom routes');
        for (const integration of integrations) {
            const name = integration.Definition?.name || integration.name;
            if (!name) continue;

            // Webhook routes (must come before general integration routes)
            lines.push(`[[redirects]]`);
            lines.push(`  from = "/api/${name}-integration/webhooks/*"`);
            lines.push(`  to = "/.netlify/functions/webhooks"`);
            lines.push(`  status = 200`);
            lines.push('');

            // Custom integration routes
            lines.push(`[[redirects]]`);
            lines.push(`  from = "/api/${name}-integration/*"`);
            lines.push(`  to = "/.netlify/functions/integration-routes"`);
            lines.push(`  status = 200`);
            lines.push('');
        }
    }

    // Queue worker (background function)
    lines.push('# Queue worker (background function - 15min execution limit)');
    lines.push('[[redirects]]');
    lines.push('  from = "/api/queue"');
    lines.push('  to = "/.netlify/functions/worker-background"');
    lines.push('  status = 200');
    lines.push('');

    // =========================================================================
    // Scheduled function (cron dispatcher)
    // =========================================================================
    lines.push('# Scheduled function — processes due one-time jobs and triggers ongoing syncs');
    lines.push('[functions."scheduled-sync"]');
    lines.push(`  schedule = "${cronSchedule}"`);
    lines.push('');

    return lines.join('\n');
}

/**
 * Generate environment variable template for Netlify
 *
 * @param {Object} appDefinition - Frigg app definition object
 * @returns {Object} Map of env var names to descriptions
 */
function generateNetlifyEnvTemplate(appDefinition) {
    const envVars = {
        // Core Frigg
        BASE_URL: 'Your Netlify site URL (e.g., https://myapp.netlify.app)',
        REDIRECT_URI: 'OAuth redirect URI (typically BASE_URL + /api/integrations/redirect)',
        FRIGG_API_KEY: 'API key for Frigg backend authentication',
        FRIGG_APP_USER_ID: 'Default user ID for app-level operations',
        HEALTH_API_KEY: 'API key for health check endpoints',
        ADMIN_API_KEY: 'API key for admin endpoints',

        // Database (MongoDB Atlas or Netlify DB)
        DATABASE_URL: 'MongoDB Atlas or Netlify DB (Neon PostgreSQL) connection string',
    };

    // Encryption (AES for Netlify — no KMS)
    const encryption = appDefinition.encryption;
    if (encryption?.fieldLevelEncryptionMethod !== 'none') {
        envVars.AES_KEY_ID = 'Identifier for the AES encryption key';
        envVars.AES_KEY = 'AES-256 encryption key (32 characters)';
        envVars.STAGE = 'Deployment stage (production, staging, dev)';
    }

    // Queue provider
    const queueProvider = appDefinition.queue?.provider;
    if (queueProvider === 'qstash') {
        envVars.QSTASH_TOKEN = 'Upstash QStash token (from console.upstash.com)';
        envVars.QSTASH_CURRENT_SIGNING_KEY = 'QStash webhook verification signing key';
        envVars.QSTASH_NEXT_SIGNING_KEY = 'QStash webhook verification next signing key';
    }

    // Integration-specific env vars from app definition
    if (appDefinition.environment) {
        for (const [key, value] of Object.entries(appDefinition.environment)) {
            if (!envVars[key]) {
                envVars[key] = typeof value === 'string' ? value : `Required: ${key}`;
            }
        }
    }

    return envVars;
}

module.exports = { generateNetlifyToml, generateNetlifyEnvTemplate };
