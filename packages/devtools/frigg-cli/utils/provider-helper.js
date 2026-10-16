/**
 * CLI Provider Helper (friggframework/frigg#545, 88cf983e / c8705715)
 *
 * Loads the app definition from the user's project and resolves its
 * provider plugin, so CLI commands can delegate to it (Netlify, ...) or fall
 * through to the AWS/serverless behaviour.
 */
const path = require('path');
const fs = require('fs');

/**
 * Find the backend: <cwd>/backend/index.js, then <cwd>/index.js.
 * @param {string} cwd
 * @returns {{ appDefinition: Object, backendDir: string } | null}
 */
function loadCliBackend(cwd) {
    for (const dir of [path.join(cwd, 'backend'), cwd]) {
        const indexPath = path.join(dir, 'index.js');
        if (!fs.existsSync(indexPath)) continue;
        try {
            const exported = require(indexPath);
            if (exported && exported.Definition) {
                return { appDefinition: exported.Definition, backendDir: dir };
            }
        } catch {
            // Failed to load, try next
        }
    }
    return null;
}

/**
 * @param {string} cwd
 * @returns {Object|null} the app Definition
 */
function loadCliAppDefinition(cwd) {
    return loadCliBackend(cwd)?.appDefinition || null;
}

/**
 * Load the app definition and resolve the provider plugin for CLI commands.
 *
 * @param {Object} [options]
 * @param {string} [options.cwd] - Working directory (default: process.cwd())
 * @returns {{ appDefinition: Object, backendDir: string, provider: Object|null, providerName: string } | null}
 *   null when no app definition is found; provider null for 'aws' (the
 *   caller keeps its existing behaviour).
 */
function loadProviderForCli(options = {}) {
    const cwd = options.cwd || process.cwd();
    const backend = loadCliBackend(cwd);
    if (!backend) {
        return null;
    }

    const providerName = backend.appDefinition.provider || 'aws';
    if (providerName === 'aws') {
        return { ...backend, provider: null, providerName: 'aws' };
    }

    const {
        resolveProvider,
    } = require('@friggframework/core/providers/resolve-provider');
    return { ...backend, provider: resolveProvider(backend.appDefinition), providerName };
}

/**
 * True when the project's app definition names a non-AWS provider. Used to
 * guard the AWS-only commands (doctor, repair, generate-iam).
 */
function isNonAwsProject(options = {}) {
    try {
        const result = loadProviderForCli(options);
        return Boolean(result && result.providerName !== 'aws');
    } catch {
        return false;
    }
}

module.exports = { loadProviderForCli, loadCliAppDefinition, loadCliBackend, isNonAwsProject };
