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
 * Resolve the Prisma database type(s) from an app definition.
 *
 * Reads appDefinition.database to determine whether the app uses
 * postgresql, mongodb, or both.  Returns an array of db type strings
 * used to build targeted included_files globs so only the relevant
 * Prisma generated client is bundled.
 *
 * @param {Object} appDefinition
 * @returns {string[]} e.g. ['postgresql'] or ['mongodb'] or ['postgresql','mongodb']
 */
function resolveDbTypes(appDefinition) {
    const db = appDefinition.database;
    if (!db) {
        // Fallback: include both so nothing breaks for apps that omit config
        return ['postgresql', 'mongodb'];
    }

    const types = [];
    if (db.postgres?.enable) types.push('postgresql');
    if (db.mongoDB?.enable) types.push('mongodb');

    // If nothing was explicitly enabled, fall back to both
    return types.length > 0 ? types : ['postgresql', 'mongodb'];
}

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
/**
 * The Management API redirects for an app: one per gateway route core's
 * route registry lists, `{proxy+}` becoming a Netlify splat. Order follows
 * the registry; duplicates (several methods on one path) are dropped.
 *
 * @param {Object} appDefinition
 * @returns {Array<{ from: string, fn: string }>}
 */
function managementApiRedirects(appDefinition) {
    const {
        getGatewayRoutes,
    } = require('@friggframework/core/management-api/route-registry');
    const managementApi = appDefinition.managementApi || {};
    const seen = new Set();
    const out = [];
    for (const route of getGatewayRoutes({
        v1: managementApi.v1 !== false,
        proxy: managementApi.proxy?.enable === true,
    })) {
        const from = route.path.replace(/\{proxy\+\}$/, '*');
        if (seen.has(from)) continue;
        seen.add(from);
        out.push({ from, fn: route.function });
    }
    return out;
}

function pushRedirect(lines, from, fn) {
    lines.push('[[redirects]]');
    lines.push(`  from = "${from}"`);
    lines.push(`  to = "/.netlify/functions/${fn}"`);
    lines.push('  status = 200');
    lines.push('');
}

function generateNetlifyToml(appDefinition, options = {}) {
    const {
        functionsDir = 'netlify/functions',
        buildCommand = 'npm run build',
        nodeVersion = '18',
        cronSchedule = '*/5 * * * *',
    } = options;

    const integrations = appDefinition.integrations || [];
    const dbTypes = resolveDbTypes(appDefinition);

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

    // Functions configuration — only include Prisma generated client for the
    // database type(s) declared in appDefinition.database to reduce bundle size.
    const prismaGlobs = dbTypes.map(
        (t) => `"node_modules/@friggframework/core/generated/prisma-${t}/**"`
    );
    const includedFiles = ['"node_modules/.prisma/**"', ...prismaGlobs].join(', ');

    lines.push('[functions]');
    lines.push('  node_bundler = "esbuild"');
    lines.push('  # Include Prisma engine + generated client for configured database');
    lines.push(`  included_files = [${includedFiles}]`);
    lines.push('  # Exclude packages that esbuild cannot bundle (native/dynamic requires)');
    lines.push('  # AWS SDKs stay external (installed node_modules, not bundled): core requires some at load time');
    lines.push('  external_node_modules = ["express", "body-parser", "cors", "serverless-http", "@prisma/client", "mongoose", "@friggframework/core", "@friggframework/provider-netlify", "aws-sdk", "@aws-sdk/*"]');
    lines.push('');

    // =========================================================================
    // Redirects — route API requests to split Netlify Functions
    // =========================================================================

    // Management API (v1 + v2) and discovery routes. Derived from core's
    // route registry, the source the AWS API Gateway routes come from
    // (devtools base-definition-factory), so both hosts expose the same
    // paths: v2 per resource, v1 unless managementApi.v1 is false, the
    // entity proxy only when managementApi.proxy.enable, /api/meta on the
    // health function.
    lines.push('# Management API (v1 + v2), from core\'s route registry');
    for (const { from, fn } of managementApiRedirects(appDefinition)) {
        pushRedirect(lines, from, fn);
    }

    // Any other /api/v2 path: the auth function answers with a v2-shaped 404
    // instead of falling through to the site. (On AWS, /api/v2/reports is
    // served by the admin-scripts Lambda, which has no Netlify function.)
    pushRedirect(lines, '/api/v2/*', 'auth');

    // User routes
    lines.push('# User routes');
    pushRedirect(lines, '/user/*', 'user');

    // Health routes
    lines.push('# Health check routes');
    pushRedirect(lines, '/health', 'health');
    pushRedirect(lines, '/health/*', 'health');

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

            // Webhook routes (must come before general integration routes).
            // The bare path too: the general receiver is POST .../webhooks.
            pushRedirect(lines, `/api/${name}-integration/webhooks`, 'webhooks');
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
    lines.push('# REQUIRED: set FRIGG_QUEUE_SIGNING_SECRET in the site environment. The worker');
    lines.push('# refuses (401, logged as frigg.netlify.queue.rejected) every message that is not');
    lines.push('# signed with it, or with a valid Upstash-Signature when the queue is QStash.');
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

    // One-time jobs are stored as ScheduledJob rows and dispatched by the
    // scheduled-sync cron; the generated functions default to it as well.
    envVars.SCHEDULER_PROVIDER = 'netlify (one-time jobs are polled by the scheduled-sync function)';

    // Queue worker authentication: required, the worker is a public URL.
    envVars.FRIGG_QUEUE_SIGNING_SECRET =
        'REQUIRED. Secret that signs queue messages to the worker-background function (HMAC-SHA256); without it every message is refused. Generate with: openssl rand -hex 32';

    // Queue provider
    const queueProvider = appDefinition.queue?.provider;
    if (queueProvider === 'qstash') {
        envVars.QSTASH_TOKEN = 'Upstash QStash token (from console.upstash.com)';
        envVars.QSTASH_CURRENT_SIGNING_KEY = 'REQUIRED. QStash current signing key: the worker verifies every Upstash-Signature with it';
        envVars.QSTASH_NEXT_SIGNING_KEY = 'REQUIRED. QStash next signing key (used during key rotation)';
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

module.exports = {
    generateNetlifyToml,
    generateNetlifyEnvTemplate,
    resolveDbTypes,
    managementApiRedirects,
};
