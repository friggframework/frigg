const { findNearestBackendPackageJson } = require('@friggframework/core/utils');
const path = require('node:path');
const fs = require('fs-extra');
const { resolveTelemetryConfig } = require('../telemetry/telemetry-config');
const { assertAdopterJwtConfig } = require('../user/adopter-jwt-config');
const { registerDeniedKeys } = require('../logs/denied-keys');
const {
    extractCredentialFieldsFromModules,
} = require('../database/encryption/encryption-schema-registry');
const {
    getEntityTypeRegistry,
    getEntityTypeDefinitions,
} = require('../modules/entity-type-registry');
const { resolveOwnershipConfig } = require('../modules/entity-scope');
const { assertProxyConfig } = require('../modules/proxy/proxy-bases');
const {
    resolveManagementApiConfig,
} = require('../management-api/management-api-config');
const { resolveScheduleConfig } = require('../integrations/schedule-config');

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
 * The definition handed to setAppDefinition(), or null when the backend is
 * discovered from process.cwd().
 */
let presetDefinition = null;

/**
 * Pre-set the app definition so loadAppDefinition() does not discover the
 * backend through process.cwd().
 *
 * Platforms such as Netlify need this: the function bundler (nft/esbuild)
 * only traces static require() calls, and at runtime process.cwd() is the
 * function root, not the backend. A generated function entry point therefore
 * requires the backend's index.js statically and passes its Definition here.
 *
 * The preset definition is validated and derived exactly like a discovered
 * one: adopter-JWT config, the entity registry, ownership and the Management
 * API config all apply, so a Netlify function and an AWS Lambda load the
 * same app the same way. Pass null to clear it.
 *
 * @param {Object|null} definition - the backend's `Definition` export
 */
function setAppDefinition(definition) {
    if (
        definition !== null &&
        (typeof definition !== 'object' || Array.isArray(definition))
    ) {
        throw new TypeError(
            'setAppDefinition expects the app Definition object (or null)'
        );
    }
    presetDefinition = definition;
}

/**
 * The definition preset with setAppDefinition(), unvalidated, or null.
 *
 * For low-level readers that only need one raw field before the app is
 * fully loaded (the database type, the custom encryption schema) and keep
 * their own process.cwd() discovery as the fallback.
 *
 * @returns {Object|null}
 */
function getPresetAppDefinition() {
    return presetDefinition;
}

function discoverAppDefinition() {
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
    return backendJsFile.Definition;
}

/**
 * Loads the App definition: the one preset with setAppDefinition(), or the
 * nearest backend package's index.js.
 * @function loadAppDefinition
 * @description Uses the definition preset by setAppDefinition() when there is one; otherwise searches for the nearest backend package.json, loads the corresponding index.js file,
 * and extracts the application definition containing integrations and user configuration.
 * @returns {{appDefinition: object, integrations: Array<object>, entities: object | null, entityTypeRegistry: Map<string, object>, moduleDefinitions: Array<object>, ownership: {scope: ({default: string, allow: string[]}|null), individualAcross: string}, userConfig: object | null, adminScripts: Array<object>, reports: Array<object>, admin: object, telemetry: object, logging: object | null, managementApi: object}} An object containing the application definition. `appDefinition` is the raw Definition object.
 * @throws {Error} Throws error if backend package.json cannot be found.
 * @throws {Error} Throws error if index.js file cannot be found in the backend directory.
 * @throws {Error} Throws error if user.authModes.adopterJwt is enabled without a usable user.jwtConfig.
 * @throws {OwnershipConfigError} Throws if an ownership or scope setting is invalid (ADR-056 §3.1).
 * @throws {ManagementApiConfigError} Throws if `managementApi.proxy.scopes` is invalid (ADR-056 §3.5).
 * @throws {ProxyConfigError} Throws if a module's `proxy.baseUrls` or an allow rule's `base` is invalid (ADR-052).
 * @throws {ScheduleConfigError} Throws if an integration's `Definition.schedule` is invalid.
 * @example
 * const { integrations, userConfig, telemetry } = loadAppDefinition();
 * console.log(`Found ${integrations.length} integrations`);
 */
function loadAppDefinition() {
    const appDefinition = presetDefinition || discoverAppDefinition();
    return resolveAppDefinition(appDefinition);
}

function resolveAppDefinition(appDefinition) {
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

    // Fail at load, not on the first request: an adopter-token mode with no
    // key source would otherwise start cleanly and answer every login with 500.
    assertAdopterJwtConfig(userConfig);

    // Fail fast: a bad `entities` registry (key/name mismatch, conflicting
    // definitions, `$infer: false` with an unregistered module) must stop the
    // app at load, not on the first request that needs a module.
    const entityTypeRegistry = getEntityTypeRegistry(appDefinition);
    const moduleDefinitions = getEntityTypeDefinitions(entityTypeRegistry);

    // Same reason for entity scopes (ADR-056 §3.1): a mistyped scope, an unknown
    // `individualAcross`, or an organization-owned integration that binds an
    // individual entity stops the app at load.
    const ownership = resolveOwnershipConfig(appDefinition, entityTypeRegistry);

    // And for the Management API: `managementApi.proxy.scopes` decides whose
    // credentials the entity proxy may act through (ADR-056 §3.5), so an
    // unknown scope stops the app here rather than being read as a default.
    const managementApiConfig = resolveManagementApiConfig(managementApi);

    // Named proxy bases (ADR-052 amendment): a module that declares both
    // `baseUrl` and `baseUrls`, a bad base URL or name, or an allow rule for a
    // base the module lacks, stops the app here.
    assertProxyConfig(moduleDefinitions, managementApiConfig.proxy);

    // And for each integration's `Definition.schedule`: a mistyped scope would
    // otherwise tick ONGOING_SYNC per class when per installation was meant.
    for (const IntegrationClass of integrations) {
        if (IntegrationClass?.Definition) {
            resolveScheduleConfig(IntegrationClass.Definition);
        }
    }

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
        appDefinition,
        integrations,
        entities,
        entityTypeRegistry,
        moduleDefinitions,
        ownership,
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
    setAppDefinition,
    getPresetAppDefinition,
};
