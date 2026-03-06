const { findNearestBackendPackageJson } = require('@friggframework/core/utils');
const path = require('node:path');
const fs = require('fs-extra');

/**
 * Cached app definition, set via setAppDefinition().
 * When set, loadAppDefinition() returns this instead of discovering
 * the backend via process.cwd().
 */
let cachedAppDefinition = null;

/**
 * Pre-set the app definition so loadAppDefinition() can return it
 * without needing process.cwd()-based discovery.
 *
 * This is critical for platforms like Netlify where:
 * - nft/esbuild traces static require() calls to determine bundle contents
 * - process.cwd() at runtime points to /var/task/, not the backend directory
 * - The caller can use a static require('../../backend/index.js') to make
 *   the backend traceable, then pass the definition here
 *
 * @param {Object} definition - The app definition object (backend's Definition export)
 */
function setAppDefinition(definition) {
    cachedAppDefinition = definition;
}

/**
 * Loads the App definition from the nearest backend package.
 *
 * If setAppDefinition() was called, returns the cached definition
 * immediately (no filesystem discovery needed).
 *
 * Otherwise, discovers the backend via process.cwd() traversal.
 *
 * Returns the full appDefinition object plus convenience destructured fields
 * for backward compatibility (integrations, userConfig).
 *
 * @function loadAppDefinition
 * @returns {{
 *   integrations: Array<object>,
 *   userConfig: object | null,
 *   appDefinition: object
 * }}
 * @throws {Error} If backend package.json or index.js cannot be found.
 * @example
 *   // Existing callers still work:
 *   const { integrations, userConfig } = loadAppDefinition();
 *
 *   // New callers can access the full definition:
 *   const { appDefinition } = loadAppDefinition();
 *   console.log(appDefinition.provider); // 'aws' | 'netlify'
 */
function loadAppDefinition() {
    if (cachedAppDefinition) {
        const { integrations = [], user: userConfig = null } = cachedAppDefinition;
        return { integrations, userConfig, appDefinition: cachedAppDefinition };
    }

    const backendPath = findNearestBackendPackageJson();
    if (!backendPath) {
        throw new Error('Could not find backend package.json');
    }

    const backendDir = path.dirname(backendPath);
    const backendFilePath = path.join(backendDir, 'index.js');
    if (!fs.existsSync(backendFilePath)) {
        throw new Error('Could not find index.js');
    }

    const backendJsFile = require(backendFilePath);
    const appDefinition = backendJsFile.Definition;

    const { integrations = [], user: userConfig = null } = appDefinition;
    return { integrations, userConfig, appDefinition };
}

module.exports = {
    loadAppDefinition,
    setAppDefinition,
};
