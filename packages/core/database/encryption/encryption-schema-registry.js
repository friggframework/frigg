/**
 * Encryption Schema Registry
 *
 * Centralized registry defining which fields require encryption for each Prisma model.
 * Database-agnostic, works identically for MongoDB and PostgreSQL.
 * Extensible by integration developers via appDefinition.
 *
 * Field path format: 'fieldName' or 'parent.child.field' for nested JSON.
 */

const { logger } = require('./logger');

/**
 * Core encryption schema (immutable - cannot be overridden by custom schemas)
 */
const CORE_ENCRYPTION_SCHEMA = {
    Credential: {
        fields: [
            'data.access_token',
            'data.refresh_token',
            'data.id_token',
            'data.api_key',
            'data.apiKey',
            'data.API_KEY_VALUE',
            'data.password',
            'data.client_secret',
        ],
    },

    IntegrationMapping: {
        fields: ['mapping'],
    },

    User: {
        fields: ['hashword'],
    },

    Token: {
        fields: ['token'],
    },
};

let customSchema = {};

/**
 * Per-model write-side opt-out: fields registered here are NOT encrypted on
 * write, but ARE still decrypted on read so legacy encrypted rows continue to
 * deserialize. Lets apps migrate a model from encrypted to plain JSON without
 * a data migration — touched rows naturally rewrite as plain on the next save,
 * untouched rows stay encrypted-but-readable forever.
 *
 * Shape: `{ ModelName: ['field.path', ...] }`
 */
let encryptionOptOut = {};

/**
 * Validates a custom encryption schema
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateCustomSchema(schema) {
    const errors = [];

    if (!schema || typeof schema !== 'object') {
        errors.push('Custom schema must be an object');
        return { valid: false, errors };
    }

    for (const [modelName, config] of Object.entries(schema)) {
        if (typeof modelName !== 'string' || !modelName) {
            errors.push(`Invalid model name: ${modelName}`);
            continue;
        }

        if (!config || typeof config !== 'object') {
            errors.push(`Model "${modelName}" must have a config object`);
            continue;
        }

        if (!Array.isArray(config.fields)) {
            errors.push(`Model "${modelName}" must have a "fields" array`);
            continue;
        }

        for (const fieldPath of config.fields) {
            if (typeof fieldPath !== 'string' || !fieldPath) {
                errors.push(`Model "${modelName}" has invalid field path: ${fieldPath}`);
            }

            // Check if trying to override core fields
            const coreFields = CORE_ENCRYPTION_SCHEMA[modelName]?.fields || [];
            if (coreFields.includes(fieldPath)) {
                errors.push(
                    `Cannot override core encrypted field "${fieldPath}" in model "${modelName}"`
                );
            }
        }
    }

    return {
        valid: errors.length === 0,
        errors,
    };
}

/**
 * Registers a custom encryption schema from integration developer.
 * Merges with core schema, prevents overriding core fields.
 * @throws {Error} If schema validation fails
 */
function registerCustomSchema(schema) {
    if (!schema || Object.keys(schema).length === 0) {
        return; // Nothing to register
    }

    const validation = validateCustomSchema(schema);
    if (!validation.valid) {
        throw new Error(
            `Invalid custom encryption schema:\n- ${validation.errors.join('\n- ')}`
        );
    }

    customSchema = { ...schema };
    logger.info(
        `Registered custom encryption schema for models: ${Object.keys(customSchema).join(', ')}`
    );
}

/**
 * Extracts credential field paths from module definitions
 * @param {Array} moduleDefinitions - Array of module definition objects
 * @returns {Array<string>} Array of field paths with data. prefix
 */
function extractCredentialFieldsFromModules(moduleDefinitions) {
    const fields = [];

    for (const moduleDef of moduleDefinitions) {
        if (!moduleDef?.encryption?.credentialFields) {
            continue;
        }

        const credentialFields = moduleDef.encryption.credentialFields;
        if (!Array.isArray(credentialFields) || credentialFields.length === 0) {
            continue;
        }

        for (const field of credentialFields) {
            const prefixedField = field.startsWith('data.') ? field : `data.${field}`;
            fields.push(prefixedField);
        }
    }

    return [...new Set(fields)];
}

/**
 * Loads and registers encryption schemas from API module definitions.
 * Each module can declare credentialFields to encrypt in its encryption config.
 *
 * @param {Array} integrations - Array of integration classes with modules
 */
function loadModuleEncryptionSchemas(integrations) {
    if (!integrations) {
        throw new Error('integrations parameter is required');
    }

    if (!Array.isArray(integrations)) {
        throw new Error('integrations must be an array');
    }

    if (integrations.length === 0) {
        return;
    }

    const { getModulesDefinitionFromIntegrationClasses } = require('../../integrations/utils/map-integration-dto');

    const moduleDefinitions = getModulesDefinitionFromIntegrationClasses(integrations);
    const credentialFields = extractCredentialFieldsFromModules(moduleDefinitions);

    if (credentialFields.length === 0) {
        return;
    }

    const moduleSchema = {
        Credential: {
            fields: credentialFields
        }
    };

    logger.info(
        `Registering module-level encryption for ${credentialFields.length} credential fields`
    );

    registerCustomSchema(moduleSchema);
}

/**
 * Loads and registers custom encryption schema from appDefinition.
 * Gracefully handles cases where appDefinition is not available.
 *
 * This ensures that custom encryption schemas defined in the backend's index.js
 * are registered before any repositories attempt to encrypt data.
 *
 * Used by both Prisma (MongoDB/PostgreSQL) and DocumentDB encryption services.
 */
function loadCustomEncryptionSchema() {
    try {
        // Lazy require to avoid circular dependency issues
        const path = require('node:path');
        const { findNearestBackendPackageJson } = require('../../utils');

        const backendPackagePath = findNearestBackendPackageJson();
        if (!backendPackagePath) {
            return; // No backend found, skip custom schema
        }

        const backendDir = path.dirname(backendPackagePath);
        const backendIndexPath = path.join(backendDir, 'index.js');

        const backendModule = require(backendIndexPath);
        const appDefinition = backendModule?.Definition;

        if (!appDefinition) {
            return; // No app definition found
        }

        // Load app-level custom schema
        const customSchema = appDefinition.encryption?.schema;
        if (customSchema && Object.keys(customSchema).length > 0) {
            registerCustomSchema(customSchema);
        }

        // Load app-level encryption opt-out — apps can declare fields they
        // don't want encrypted on write (decryption on read still works,
        // so legacy data remains readable).
        const disable = appDefinition.encryption?.disable;
        if (disable && Object.keys(disable).length > 0) {
            registerEncryptionOptOut(disable);
        }

        // Load module-level encryption schemas from integrations
        const integrations = appDefinition.integrations;
        if (integrations && Array.isArray(integrations)) {
            loadModuleEncryptionSchemas(integrations);
        }
    } catch (error) {
        // Silently ignore errors - custom schema is optional
        // This handles cases like:
        // - Backend package.json not found (tests, standalone usage)
        // - No appDefinition defined
        // - No custom encryption schema specified
        logger.debug('Could not load custom encryption schema:', error.message);
    }
}

function getEncryptedFields(modelName) {
    const coreFields = CORE_ENCRYPTION_SCHEMA[modelName]?.fields || [];
    const customFields = customSchema[modelName]?.fields || [];
    const allFields = [...coreFields, ...customFields];
    return [...new Set(allFields)];
}

/**
 * Validates an encryption opt-out config.
 *
 * Unlike custom schema validation, opt-out IS allowed to target paths that
 * already live in CORE_ENCRYPTION_SCHEMA — that's the entire point.
 *
 * @param {Object} optOut - Map of `{ ModelName: ['field.path', ...] }`
 * @returns {{valid: boolean, errors: string[]}}
 */
function validateOptOut(optOut) {
    const errors = [];

    if (!optOut || typeof optOut !== 'object') {
        errors.push('Encryption opt-out must be an object');
        return { valid: false, errors };
    }

    for (const [modelName, fields] of Object.entries(optOut)) {
        if (typeof modelName !== 'string' || !modelName) {
            errors.push(`Invalid model name in opt-out: ${modelName}`);
            continue;
        }

        if (!Array.isArray(fields)) {
            errors.push(
                `Model "${modelName}" opt-out must be an array of field paths`
            );
            continue;
        }

        for (const fieldPath of fields) {
            if (typeof fieldPath !== 'string' || !fieldPath) {
                errors.push(
                    `Model "${modelName}" has invalid opt-out field path: ${fieldPath}`
                );
            }
        }
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Registers an encryption opt-out config. Listed fields will be skipped during
 * encryption on write while still being eligible for decryption on read (so
 * legacy encrypted rows still deserialize correctly).
 *
 * Intended call site: `appDefinition.encryption.disable` via
 * `loadCustomEncryptionSchema`.
 *
 * @param {Object} optOut - Map of `{ ModelName: ['field.path', ...] }`
 * @throws {Error} If opt-out validation fails
 */
function registerEncryptionOptOut(optOut) {
    if (!optOut || Object.keys(optOut).length === 0) {
        return;
    }

    const validation = validateOptOut(optOut);
    if (!validation.valid) {
        throw new Error(
            `Invalid encryption opt-out:\n- ${validation.errors.join('\n- ')}`
        );
    }

    encryptionOptOut = { ...optOut };
    logger.info(
        `Registered encryption opt-out for models: ${Object.keys(
            encryptionOptOut
        ).join(', ')}`
    );
}

/**
 * Returns the field paths that should be encrypted when writing the given
 * model. This is `getEncryptedFields` minus any paths the app has opted out
 * of via `registerEncryptionOptOut`.
 *
 * Use this in the encrypt-on-write path of the FieldEncryptionService.
 */
function getFieldsToEncryptOnWrite(modelName) {
    const allFields = getEncryptedFields(modelName);
    const optedOut = new Set(encryptionOptOut[modelName] || []);
    if (optedOut.size === 0) return allFields;
    return allFields.filter((path) => !optedOut.has(path));
}

/**
 * Returns the field paths that should be checked for decryption when reading
 * the given model. Always includes opted-out paths so legacy encrypted rows
 * remain readable after an app opts a field out.
 *
 * `FieldEncryptionService._isEncrypted` already short-circuits for plain JSON
 * values, so listing more fields than necessary here is harmless.
 *
 * Use this in the decrypt-on-read path of the FieldEncryptionService.
 */
function getFieldsToDecryptOnRead(modelName) {
    return getEncryptedFields(modelName);
}

/**
 * Clears any registered encryption opt-outs. Test-helper; not intended for
 * runtime use.
 */
function resetEncryptionOptOut() {
    encryptionOptOut = {};
}

function hasEncryptedFields(modelName) {
    return getEncryptedFields(modelName).length > 0;
}

function getEncryptedModels() {
    const coreModels = Object.keys(CORE_ENCRYPTION_SCHEMA);
    const customModels = Object.keys(customSchema);
    return [...new Set([...coreModels, ...customModels])];
}

function resetCustomSchema() {
    customSchema = {};
}

module.exports = {
    CORE_ENCRYPTION_SCHEMA,
    getEncryptedFields,
    getFieldsToEncryptOnWrite,
    getFieldsToDecryptOnRead,
    hasEncryptedFields,
    getEncryptedModels,
    registerCustomSchema,
    registerEncryptionOptOut,
    loadCustomEncryptionSchema,
    loadModuleEncryptionSchemas,
    extractCredentialFieldsFromModules,
    validateCustomSchema,
    validateOptOut,
    resetCustomSchema,
    resetEncryptionOptOut,
};
