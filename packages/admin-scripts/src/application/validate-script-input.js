/**
 * Validate Script Input
 *
 * Application Layer - Standalone validation for script inputs.
 * Used by the /validate endpoint to preview what would be executed
 * without actually running the script.
 */

/**
 * Validate script input parameters against the script's definition and schema.
 *
 * @param {Object} scriptFactory - Script factory instance
 * @param {string} scriptName - Name of the script to validate
 * @param {Object} params - Input parameters to validate
 * @returns {Object} Validation preview result
 */
function validateScriptInput(scriptFactory, scriptName, params = {}) {
    const scriptClass = scriptFactory.get(scriptName);
    const definition = scriptClass.Definition;
    const validation = validateParams(definition, params);

    return {
        status: validation.valid ? 'VALID' : 'INVALID',
        scriptName,
        preview: {
            script: {
                name: definition.name,
                version: definition.version,
                description: definition.description,
                requireIntegrationInstance: definition.config?.requireIntegrationInstance || false,
            },
            input: params,
            inputSchema: definition.inputSchema || null,
            validation,
        },
        message: validation.valid
            ? 'Validation passed. Script is ready to execute with provided parameters.'
            : `Validation failed: ${validation.errors.join(', ')}`,
    };
}

/**
 * Validate parameters against a script's input schema.
 *
 * @param {Object} definition - Script definition
 * @param {Object} params - Input parameters
 * @returns {Object} { valid: boolean, errors: string[] }
 */
function validateParams(definition, params) {
    const errors = [];
    const schema = definition.inputSchema;

    if (!schema) {
        return { valid: true, errors: [] };
    }

    // Check required fields
    if (schema.required && Array.isArray(schema.required)) {
        for (const field of schema.required) {
            if (params[field] === undefined || params[field] === null) {
                errors.push(`Missing required parameter: ${field}`);
            }
        }
    }

    // Basic type validation for properties
    if (schema.properties) {
        for (const [key, prop] of Object.entries(schema.properties)) {
            const value = params[key];
            if (value !== undefined && value !== null) {
                const typeError = validateType(key, value, prop);
                if (typeError) {
                    errors.push(typeError);
                }
            }
        }
    }

    return { valid: errors.length === 0, errors };
}

/**
 * Validate a single parameter type.
 *
 * @param {string} key - Parameter name
 * @param {*} value - Parameter value
 * @param {Object} schema - JSON Schema property definition
 * @returns {string|null} Error message or null if valid
 */
function validateType(key, value, schema) {
    const expectedType = schema.type;
    if (!expectedType) return null;

    if (expectedType === 'integer' && (typeof value !== 'number' || !Number.isInteger(value))) {
        return `Parameter "${key}" must be an integer`;
    }
    if (expectedType === 'number' && typeof value !== 'number') {
        return `Parameter "${key}" must be a number`;
    }
    if (expectedType === 'string' && typeof value !== 'string') {
        return `Parameter "${key}" must be a string`;
    }
    if (expectedType === 'boolean' && typeof value !== 'boolean') {
        return `Parameter "${key}" must be a boolean`;
    }
    if (expectedType === 'array' && !Array.isArray(value)) {
        return `Parameter "${key}" must be an array`;
    }
    if (expectedType === 'object' && (typeof value !== 'object' || Array.isArray(value))) {
        return `Parameter "${key}" must be an object`;
    }

    return null;
}

module.exports = { validateScriptInput, validateParams, validateType };
