/**
 * @friggframework/schemas - Canonical JSON Schema definitions for Frigg Framework
 * 
 * This package provides formal JSON Schema definitions for all core Frigg configuration
 * objects, along with runtime validation utilities.
 */

const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const fs = require('fs');
const path = require('path');

// Initialize AJV with formats
const ajv = new Ajv({ 
    allErrors: true, 
    verbose: true,
    strict: false
});
addFormats(ajv);

// Load all schemas
const schemas = {};
const schemaDir = path.join(__dirname, 'schemas');

// Load schema files
const schemaFiles = [
    'app-definition.schema.json',
    'integration-definition.schema.json', 
    'api-module-definition.schema.json',
    'serverless-config.schema.json',
    'environment-config.schema.json',
    'core-models.schema.json'
];

schemaFiles.forEach(file => {
    const schemaPath = path.join(schemaDir, file);
    const schemaContent = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
    const schemaName = file.replace('.schema.json', '');
    
    schemas[schemaName] = schemaContent;
    ajv.addSchema(schemaContent, schemaName);
});

/**
 * Validate an object against a schema
 * @param {string} schemaName - Name of the schema to validate against
 * @param {object} data - Data to validate
 * @returns {object} - Validation result with { valid: boolean, errors?: array }
 */
function validate(schemaName, data) {
    const validator = ajv.getSchema(schemaName);
    
    if (!validator) {
        throw new Error(`Schema '${schemaName}' not found. Available schemas: ${Object.keys(schemas).join(', ')}`);
    }
    
    const valid = validator(data);
    
    return {
        valid,
        errors: valid ? null : validator.errors,
        data
    };
}

/**
 * Validate App Definition
 * @param {object} appDefinition - App definition object to validate
 * @returns {object} - Validation result
 */
function validateAppDefinition(appDefinition) {
    return validate('app-definition', appDefinition);
}

/**
 * Validate Integration Definition  
 * @param {object} integrationDefinition - Integration definition object to validate
 * @returns {object} - Validation result
 */
function validateIntegrationDefinition(integrationDefinition) {
    return validate('integration-definition', integrationDefinition);
}

/**
 * Validate API Module Definition
 * @param {object} apiModuleDefinition - API module definition object to validate  
 * @returns {object} - Validation result
 */
function validateApiModuleDefinition(apiModuleDefinition) {
    return validate('api-module-definition', apiModuleDefinition);
}

/**
 * Validate Serverless Configuration
 * @param {object} serverlessConfig - Serverless configuration object to validate
 * @returns {object} - Validation result
 */
function validateServerlessConfig(serverlessConfig) {
    return validate('serverless-config', serverlessConfig);
}

/**
 * Validate Environment Configuration
 * @param {object} environmentConfig - Environment configuration object to validate
 * @returns {object} - Validation result
 */
function validateEnvironmentConfig(environmentConfig) {
    return validate('environment-config', environmentConfig);
}

/**
 * Validate Core Models
 * @param {object} coreModels - Core models object to validate
 * @returns {object} - Validation result
 */
function validateCoreModels(coreModels) {
    return validate('core-models', coreModels);
}

/**
 * Get all available schemas
 * @returns {object} - Object containing all loaded schemas
 */
function getSchemas() {
    return { ...schemas };
}

/**
 * Get a specific schema by name
 * @param {string} schemaName - Name of the schema to retrieve
 * @returns {object} - Schema object
 */
function getSchema(schemaName) {
    if (!schemas[schemaName]) {
        throw new Error(`Schema '${schemaName}' not found. Available schemas: ${Object.keys(schemas).join(', ')}`);
    }
    return schemas[schemaName];
}

/**
 * Format validation errors for human-readable output
 * @param {array} errors - AJV validation errors
 * @returns {string} - Formatted error message
 */
function formatErrors(errors) {
    if (!errors || errors.length === 0) {
        return 'No errors';
    }
    
    return errors.map(error => {
        const instancePath = error.instancePath || 'root';
        const message = error.message;
        const allowedValues = error.params?.allowedValues ? 
            ` (allowed: ${error.params.allowedValues.join(', ')})` : '';
        
        return `${instancePath}: ${message}${allowedValues}`;
    }).join('\n');
}

module.exports = {
    validate,
    validateAppDefinition,
    validateIntegrationDefinition,
    validateApiModuleDefinition,
    validateServerlessConfig,
    validateEnvironmentConfig,
    validateCoreModels,
    getSchemas,
    getSchema,
    formatErrors,
    schemas,
    ajv
};