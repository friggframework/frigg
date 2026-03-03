/**
 * @friggframework/provider-netlify
 *
 * Netlify provider plugin for the Frigg Framework.
 *
 * Exports the full provider plugin interface as defined in the
 * provider plugin architecture (see plan.md). Can be loaded by
 * the provider registry via:
 *
 *   const provider = require('@friggframework/provider-netlify');
 *   // provider.name === 'netlify'
 *
 * Also re-exports individual utilities for direct use:
 *
 *   const { generateNetlifyToml } = require('@friggframework/provider-netlify');
 */

// ── Runtime Adapters ──────────────────────────────────────────────
const { createNetlifyHandler } = require('./lib/create-netlify-handler');
const {
    createNetlifyApp,
    createNetlifyAppHandler,
} = require('./lib/create-netlify-app-handler');
const {
    NetlifyBackgroundProvider,
} = require('@friggframework/core/queues/providers/netlify-background-provider');
const {
    NetlifySchedulerAdapter,
} = require('@friggframework/core/infrastructure/scheduler/netlify-scheduler-adapter');
const { loadSecrets } = require('./lib/load-secrets');
const { invokeFunctionAdapter } = require('./lib/invoke-function-adapter');

// ── Build-Time / Infrastructure ───────────────────────────────────
const {
    generateNetlifyToml,
    generateNetlifyEnvTemplate,
} = require('./lib/generate-netlify-config');
const { validateNetlifyConfig } = require('./lib/validate');
const { validateNetlifyDbConfig } = require('./lib/netlify-db');
const {
    getFunctionEntryPoints,
    getFunctionEntryPointsDir,
    getLibEntryPoints,
} = require('./lib/get-function-entry-points');

// ── Deploy ────────────────────────────────────────────────────────
const { deploy, preflightCheck, teardown } = require('./lib/deploy');
const { detect } = require('./lib/detect');

// ── Utilities ─────────────────────────────────────────────────────
const { ScheduledJobRepository } = require('./lib/scheduled-job-repository');

// ═══════════════════════════════════════════════════════════════════
// Provider Plugin Interface
// Conforms to the shape defined in plan.md § Provider Plugin Interface
// ═══════════════════════════════════════════════════════════════════

module.exports = {
    // Provider identifier
    name: 'netlify',

    // ── Runtime Adapters ──────────────────────────────────────────
    createHandler: createNetlifyHandler,
    createAppHandler: createNetlifyAppHandler,
    QueueProvider: NetlifyBackgroundProvider,
    SchedulerAdapter: NetlifySchedulerAdapter,
    CryptorAdapter: null, // Reuse core AES — no Netlify-specific encryption
    loadSecrets,
    invokeFunctionAdapter,
    WebSocketAdapter: null, // Netlify does not support persistent WebSockets

    utils: {
        ScheduledJobRepository,
        createNetlifyApp,
        getFunctionEntryPointsDir,
    },

    // ── Build-Time / Infrastructure ───────────────────────────────
    generateConfig: generateNetlifyToml,
    generateEnvTemplate: generateNetlifyEnvTemplate,
    infrastructureBuilders: [], // Netlify is fully managed — no IaC builders needed

    // ── Deploy ────────────────────────────────────────────────────
    deploy,
    preflightCheck,
    teardown,
    validate: validateNetlifyConfig,
    getFunctionEntryPoints,
    getLibEntryPoints,
    detect,

    // ── Metadata ──────────────────────────────────────────────────
    recommendedDatabases: ['database-postgres'],
    providedEnvVars: ['DATABASE_URL', 'URL', 'NETLIFY', 'NETLIFY_SITE_ID'],

    // ── Direct utility exports (backward compat) ──────────────────
    createNetlifyHandler,
    createNetlifyApp,
    createNetlifyAppHandler,
    generateNetlifyToml,
    generateNetlifyEnvTemplate,
    validateNetlifyDbConfig,
    validateNetlifyConfig,
    getFunctionEntryPointsDir,
    ScheduledJobRepository,
};
