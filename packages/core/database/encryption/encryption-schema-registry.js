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
 * Loads and registers custom encryption schema from appDefinition.
 * Gracefully handles cases where appDefinition is not available.
 *
 * This ensures that custom encryption schemas defined in the backend's index.js
 * are registered before any repositories attempt to encrypt data.
 *
 * Called eagerly when this module is first imported to avoid race conditions.
 * Safe to call multiple times (registerCustomSchema checks for duplicates).
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

        const customSchemaFromApp = appDefinition.encryption?.schema;

        if (customSchemaFromApp && Object.keys(customSchemaFromApp).length > 0) {
            registerCustomSchema(customSchemaFromApp);
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

// Eagerly load custom encryption schema when module is first imported
// This ensures the schema is available before any encryption operations occur,
// preventing race conditions in concurrent execution environments (e.g., Lambda)
loadCustomEncryptionSchema();

module.exports = {
    CORE_ENCRYPTION_SCHEMA,
    getEncryptedFields,
    hasEncryptedFields,
    getEncryptedModels,
    registerCustomSchema,
    loadCustomEncryptionSchema,
    validateCustomSchema,
    resetCustomSchema, // For testing only
};
