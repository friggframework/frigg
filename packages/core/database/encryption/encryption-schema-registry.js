/**
 * Encryption Schema Registry
 *
 * Infrastructure Layer - Configuration
 *
 * Centralized registry defining which fields require encryption for each Prisma model.
 * This is database-agnostic and works identically for MongoDB and PostgreSQL.
 *
 * Purpose:
 * - Single source of truth for encrypted fields
 * - Security audit trail (compliance)
 * - Easy to extend with metadata (rotation policy, algorithm version)
 * - Testable (validate coverage, ensure no plaintext leaks)
 * - Extensible by integration developers via appDefinition
 *
 * Replaces Mongoose `lhEncrypt: true` schema option with explicit configuration.
 *
 * Field Path Format:
 * - Top-level fields: 'fieldName'
 * - Nested JSON fields: 'parent.child.field'
 * - Example: 'data.access_token' for Credential.data.access_token
 */

/**
 * Core encryption schema (immutable)
 * These fields are always encrypted and cannot be overridden
 *
 * @type {Object.<string, {fields: string[]}>}
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

/**
 * Custom encryption schema registered by integration developers
 * @type {Object.<string, {fields: string[]}>}
 */
let customSchema = {};

/**
 * Validates a custom encryption schema
 * @param {Object.<string, {fields: string[]}>} schema - Custom schema to validate
 * @returns {{valid: boolean, errors: string[]}} Validation result
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
 * Registers a custom encryption schema from integration developer
 * Merges with core schema, but prevents overriding core fields
 *
 * @param {Object.<string, {fields: string[]}>} schema - Custom encryption schema
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
    console.log(
        `[Frigg] Registered custom encryption schema for models: ${Object.keys(customSchema).join(', ')}`
    );
}

/**
 * Gets all encrypted field paths for a model (core + custom)
 * @param {string} modelName - Prisma model name
 * @returns {string[]} Array of field paths to encrypt
 */
function getEncryptedFields(modelName) {
    const coreFields = CORE_ENCRYPTION_SCHEMA[modelName]?.fields || [];
    const customFields = customSchema[modelName]?.fields || [];

    // Merge and deduplicate
    const allFields = [...coreFields, ...customFields];
    return [...new Set(allFields)];
}

/**
 * Checks if a model has any encrypted fields
 * @param {string} modelName - Prisma model name
 * @returns {boolean}
 */
function hasEncryptedFields(modelName) {
    return getEncryptedFields(modelName).length > 0;
}

/**
 * Gets all model names that have encrypted fields
 * @returns {string[]} Array of model names
 */
function getEncryptedModels() {
    const coreModels = Object.keys(CORE_ENCRYPTION_SCHEMA);
    const customModels = Object.keys(customSchema);
    return [...new Set([...coreModels, ...customModels])];
}

/**
 * Resets custom schema (for testing)
 * @private
 */
function resetCustomSchema() {
    customSchema = {};
}

module.exports = {
    CORE_ENCRYPTION_SCHEMA,
    getEncryptedFields,
    hasEncryptedFields,
    getEncryptedModels,
    registerCustomSchema,
    validateCustomSchema,
    resetCustomSchema, // For testing only
};
