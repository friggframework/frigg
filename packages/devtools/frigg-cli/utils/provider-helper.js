/**
 * CLI Provider Helper
 *
 * Loads the appDefinition from the user's project and resolves the
 * corresponding provider plugin package. Used by CLI commands to
 * delegate to the correct provider (AWS, Netlify, etc.).
 */
const path = require('path');
const fs = require('fs');

/**
 * Load the appDefinition and resolve the provider plugin for CLI commands.
 *
 * This is a lightweight loader for the CLI context — it reads the backend
 * index.js directly (no need for the full core app-definition-loader which
 * searches for the nearest backend package.json at runtime).
 *
 * @param {Object} [options]
 * @param {string} [options.cwd] - Working directory (default: process.cwd())
 * @returns {{ appDefinition: Object, provider: Object, providerName: string } | null}
 *   Returns null if no appDefinition is found (caller should fall back to default behavior).
 */
function loadProviderForCli(options = {}) {
    const cwd = options.cwd || process.cwd();
    const appDefinition = loadCliAppDefinition(cwd);

    if (!appDefinition) {
        return null;
    }

    const providerName = appDefinition.provider || 'aws';

    // For 'aws', return null provider — CLI commands fall back to existing behavior
    if (providerName === 'aws') {
        return { appDefinition, provider: null, providerName: 'aws' };
    }

    // For other providers, resolve the package
    const {
        resolveProvider,
    } = require('@friggframework/core/providers/resolve-provider');

    const provider = resolveProvider(appDefinition);
    return { appDefinition, provider, providerName };
}

/**
 * Load the appDefinition from the backend directory.
 * Tries backend/index.js then index.js in the current directory.
 *
 * @param {string} cwd
 * @returns {Object|null}
 */
function loadCliAppDefinition(cwd) {
    // Try backend/index.js first (standard Frigg app structure)
    const backendIndexPath = path.join(cwd, 'backend', 'index.js');
    const rootIndexPath = path.join(cwd, 'index.js');

    for (const indexPath of [backendIndexPath, rootIndexPath]) {
        if (fs.existsSync(indexPath)) {
            try {
                const exported = require(indexPath);
                if (exported.Definition) {
                    return exported.Definition;
                }
            } catch {
                // Failed to load, try next
            }
        }
    }

    return null;
}

module.exports = { loadProviderForCli, loadCliAppDefinition };
