const { findNearestBackendPackageJson } = require('@friggframework/core/utils');
const path = require('node:path');
const fs = require('fs-extra');

/**
 * Loads the App definition from the nearest backend package
 * @function loadAppDefinition
 * @description Searches for the nearest backend package.json, loads the corresponding index.js file,
 * and extracts the application definition containing integrations and user configuration.
 * @returns {{integrations: Array<object>, userConfig: object | null}} An object containing the application definition.
 * @throws {Error} Throws error if backend package.json cannot be found.
 * @throws {Error} Throws error if index.js file cannot be found in the backend directory.
 * @example
 * const { integrations, userConfig } = loadAppDefinition();
 * console.log(`Found ${integrations.length} integrations`);
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
    return { integrations, userConfig };
}

module.exports = {
    loadAppDefinition,
}; 