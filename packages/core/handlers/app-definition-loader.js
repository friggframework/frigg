const { findNearestBackendPackageJson } = require('@friggframework/core/utils');
const path = require('node:path');
const fs = require('fs-extra');

/**
 * Loads the App definition from the nearest backend package.
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
};
