const { findNearestBackendPackageJson } = require('@friggframework/core/utils');
const path = require('node:path');
const fs = require('fs-extra');
const { resolveTelemetryConfig } = require('../telemetry/telemetry-config');
const { registerDeniedKeys } = require('../logs/denied-keys');
const {
    extractCredentialFieldsFromModules,
} = require('../database/encryption/encryption-schema-registry');
const {
    getEntityTypeRegistry,
    getEntityTypeDefinitions,
} = require('../modules/entity-type-registry');

// Handlers without a database never load the encryption registry, so the
// credential leaf keys are registered for redaction here too.
function registerCredentialLogKeys(appDefinition, moduleDefinitions) {
    try {
        extractCredentialFieldsFromModules(moduleDefinitions);
    } catch {
        // An odd integration shape must not stop the app from loading.
    }
    const schema = appDefinition.encryption?.schema;
    if (schema && typeof schema === 'object') {
        for (const config of Object.values(schema)) {
            registerDeniedKeys(config?.fields);
        }
    }
}

/**
 * Loads the App definition from the nearest backend package
 * @function loadAppDefinition
 * @description Searches for the nearest backend package.json, loads the corresponding index.js file,
 * and extracts the application definition containing integrations and user configuration.
 * @returns {{integrations: Array<object>, entities: object | null, entityTypeRegistry: Map<string, object>, moduleDefinitions: Array<object>, userConfig: object | null, adminScripts: Array<object>, reports: Array<object>, admin: object, telemetry: object, logging: object | null, managementApi: object}} An object containing the application definition.
 * @throws {Error} Throws error if backend package.json cannot be found.
 * @throws {Error} Throws error if index.js file cannot be found in the backend directory.
 * @example
 * const { integrations, userConfig, telemetry } = loadAppDefinition();
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

    const {
        integrations = [],
        entities = null,
        user: userConfig = null,
        adminScripts = [],
        reports = [],
        admin = {},
        logging = null,
        managementApi = {},
    } = appDefinition;

    // Fail fast: a bad `entities` registry (key/name mismatch, conflicting
    // definitions, `$infer: false` with an unregistered module) must stop the
    // app at load, not on the first request that needs a module.
    const entityTypeRegistry = getEntityTypeRegistry(appDefinition);
    const moduleDefinitions = getEntityTypeDefinitions(entityTypeRegistry);

    registerCredentialLogKeys(appDefinition, moduleDefinitions);

    // Degrade consistently: an invalid telemetry block must never take down a
    // router bundle that loads the app definition at module scope (telemetry is
    // never allowed to break a handler). The singletons apply the same
    // fall-back, so all consumers behave identically.
    let telemetry;
    try {
        telemetry = resolveTelemetryConfig(appDefinition);
    } catch (error) {
        console.warn(
            `[Frigg][telemetry] invalid telemetry config, defaulting to disabled: ${
                error && error.message
            }`
        );
        telemetry = {
            exporter: { type: 'none' },
            northStar: null,
            sampleRatio: 1,
            subscribers: [],
        };
    }

    return {
        integrations,
        entities,
        entityTypeRegistry,
        moduleDefinitions,
        userConfig,
        adminScripts,
        reports,
        admin,
        telemetry,
        logging,
        managementApi,
    };
}

module.exports = {
    loadAppDefinition,
};
