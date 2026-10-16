/**
 * Application Initialization with Extension Lifecycle
 *
 * Provides an async initialization function that runs extension bootstraps
 * after database connection but before router creation. This is the integration
 * point for providers (Lambda, Netlify) to hook into the extension lifecycle.
 *
 * Call `initializeApp()` during the async startup phase of your handler/function.
 * It is safe to call multiple times — subsequent calls are no-ops.
 *
 * @example
 * const { initializeApp } = require('@friggframework/core/extensions/initialize-app');
 *
 * // In a Lambda handler or Netlify function:
 * await initializeApp();
 * // Now extensions are bootstrapped and router can be created
 */

const { loadExtensions } = require('./extension-loader');
const { runExtensionBootstraps } = require('./bootstrap-runner');

let _initialized = false;
let _initPromise = null;

/**
 * Initializes extensions by running bootstrap hooks.
 *
 * This function:
 * 1. Loads the app definition
 * 2. Loads and validates extensions
 * 3. Runs extension bootstrap hooks in sequence
 *
 * Bootstrap hooks receive (prisma, appDefinition) and can:
 * - Load credentials from database into integration Definition.env
 * - Register services or middleware
 * - Perform any one-time async initialization
 *
 * @param {Object} [options]
 * @param {Object} [options.appDefinition] - Override app definition (skips loadAppDefinition)
 * @param {Object} [options.prisma] - Override Prisma client instance
 * @param {boolean} [options.force=false] - Force re-initialization
 * @returns {Promise<{extensions: Array}>} The loaded extensions
 */
async function initializeApp(options = {}) {
    const { force = false } = options;

    // Return cached promise if already initializing (prevent race conditions)
    if (_initPromise && !force) {
        return _initPromise;
    }

    if (_initialized && !force) {
        return { extensions: [] };
    }

    _initPromise = _doInitialize(options);

    try {
        const result = await _initPromise;
        _initialized = true;
        return result;
    } catch (error) {
        _initPromise = null;
        throw error;
    }
}

async function _doInitialize(options = {}) {
    let { appDefinition, prisma } = options;

    // Load app definition if not provided
    if (!appDefinition) {
        try {
            const { loadAppDefinition } = require('../handlers/app-definition-loader');
            const loaded = loadAppDefinition();
            appDefinition = loaded.appDefinition;
        } catch {
            // No app definition available — skip extension bootstrap
            return { extensions: [] };
        }
    }

    if (!appDefinition) {
        return { extensions: [] };
    }

    // Load extensions
    const extensions = loadExtensions(appDefinition);

    if (extensions.length === 0) {
        return { extensions };
    }

    // Get Prisma client if not provided
    if (!prisma) {
        try {
            const db = require('../database/prisma');
            prisma = db.prisma;
        } catch {
            // Prisma not available — skip bootstrap
            console.warn('Prisma client not available, skipping extension bootstraps');
            return { extensions };
        }
    }

    // Run bootstrap hooks
    await runExtensionBootstraps(extensions, { prisma, appDefinition });

    return { extensions };
}

/**
 * Reset initialization state (for testing).
 */
function resetInitialization() {
    _initialized = false;
    _initPromise = null;
}

module.exports = {
    initializeApp,
    resetInitialization,
};
