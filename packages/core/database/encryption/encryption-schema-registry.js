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
            // OAuth tokens
            'data.access_token',
            'data.refresh_token',
            'data.id_token',
            // API key authentication (multiple naming conventions)
            'data.api_key',
            'data.apiKey',
            'data.API_KEY_VALUE',
            // Basic authentication
            'data.password',
            // OAuth client credentials
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
 * Loads and registers encryption schemas from API module definitions.
 * Each module can declare credentialFields to encrypt in its encryption config.
 *
 * @param {Array} integrations - Array of integration classes with modules
 */
function loadModuleEncryptionSchemas(integrations) {
    if (!integrations || !Array.isArray(integrations)) {
        return;
    }

    const moduleSchemas = {};

    for (const Integration of integrations) {
        const integrationDef = Integration?.Definition;
        if (!integrationDef || !integrationDef.modules) {
            continue;
        }

        // Iterate through all modules in this integration
        for (const [moduleName, moduleConfig] of Object.entries(integrationDef.modules)) {
            const moduleDef = moduleConfig?.definition;
            if (!moduleDef) {
                continue;
            }

            const credentialFields = moduleDef.encryption?.credentialFields;
            if (!credentialFields || !Array.isArray(credentialFields) || credentialFields.length === 0) {
                continue;
            }

            // Convert module credential fields to Credential model schema
            // Module defines: ['api_key', 'custom_token']
            // We convert to: ['data.api_key', 'data.custom_token']
            const prefixedFields = credentialFields.map(field => {
                // If field already has 'data.' prefix, use as-is
                if (field.startsWith('data.')) {
                    return field;
                }
                // Otherwise, add 'data.' prefix for Credential model
                return `data.${field}`;
            });

            // Merge with existing Credential fields
            if (!moduleSchemas.Credential) {
                moduleSchemas.Credential = { fields: [] };
            }
            moduleSchemas.Credential.fields.push(...prefixedFields);
        }
    }

    // Remove duplicates
    if (moduleSchemas.Credential) {
        moduleSchemas.Credential.fields = [...new Set(moduleSchemas.Credential.fields)];
    }

    // Register the combined module schemas
    if (Object.keys(moduleSchemas).length > 0) {
        logger.info(
            `Registering module-level encryption for ${moduleSchemas.Credential?.fields.length || 0} credential fields`
        );
        registerCustomSchema(moduleSchemas);
    }
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
    hasEncryptedFields,
    getEncryptedModels,
    registerCustomSchema,
    loadCustomEncryptionSchema,
    loadModuleEncryptionSchemas,
    validateCustomSchema,
    resetCustomSchema, // For testing only
};
