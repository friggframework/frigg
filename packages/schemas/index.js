/**
 * @friggframework/schemas - Canonical JSON Schema definitions for Frigg Framework
 *
 * This package provides formal JSON Schema definitions for all core Frigg configuration
 * objects, along with runtime validation utilities and Express middleware.
 */

const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const fs = require('fs');
const path = require('path');

// Import middleware
const schemaValidationMiddleware = require('./middleware/schema-validation');

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
    'core-models.schema.json',
    'api-authorization.schema.json',
    'api-credentials.schema.json',
    'api-entities.schema.json',
    'api-proxy.schema.json'
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
 * Validate Authorization Requirements
 * @param {object} requirements - Authorization requirements object to validate
 * @returns {object} - Validation result
 */
function validateAuthorizationRequirements(requirements) {
    return validate('api-authorization#/definitions/authorizationRequirements', requirements);
}

/**
 * Validate Authorization Request
 * @param {object} request - Authorization request object to validate
 * @returns {object} - Validation result
 */
function validateAuthorizationRequest(request) {
    return validate('api-authorization#/definitions/authorizationRequest', request);
}

/**
 * Validate Authorization Response
 * @param {object} response - Authorization response object to validate
 * @returns {object} - Validation result
 */
function validateAuthorizationResponse(response) {
    return validate('api-authorization#/definitions/authorizationResponse', response);
}

/**
 * Validate Authorization Session
 * @param {object} session - Authorization session object to validate
 * @returns {object} - Validation result
 */
function validateAuthorizationSession(session) {
    return validate('api-authorization#/definitions/authorizationSession', session);
}

/**
 * Validate Credential
 * @param {object} credential - Credential object to validate
 * @returns {object} - Validation result
 */
function validateCredential(credential) {
    return validate('api-credentials#/definitions/credential', credential);
}

/**
 * Validate List Credentials Response
 * @param {object} response - List credentials response object to validate
 * @returns {object} - Validation result
 */
function validateListCredentialsResponse(response) {
    return validate('api-credentials#/definitions/listCredentialsResponse', response);
}

/**
 * Validate Get Credential Response
 * @param {object} response - Get credential response object to validate
 * @returns {object} - Validation result
 */
function validateGetCredentialResponse(response) {
    return validate('api-credentials#/definitions/getCredentialResponse', response);
}

/**
 * Validate Delete Credential Response
 * @param {object} response - Delete credential response object to validate
 * @returns {object} - Validation result
 */
function validateDeleteCredentialResponse(response) {
    return validate('api-credentials#/definitions/deleteCredentialResponse', response);
}

/**
 * Validate Reauthorize Credential Request
 * @param {object} request - Reauthorize credential request object to validate
 * @returns {object} - Validation result
 */
function validateReauthorizeCredentialRequest(request) {
    return validate('api-credentials#/definitions/reauthorizeCredentialRequest', request);
}

/**
 * Validate Reauthorize Credential Response
 * @param {object} response - Reauthorize credential response object to validate
 * @returns {object} - Validation result
 */
function validateReauthorizeCredentialResponse(response) {
    return validate('api-credentials#/definitions/reauthorizeCredentialResponse', response);
}

/**
 * Validate Proxy Request
 * @param {object} request - Proxy request object to validate
 * @returns {object} - Validation result
 */
function validateProxyRequest(request) {
    return validate('api-proxy#/definitions/proxyRequest', request);
}

/**
 * Validate Proxy Response
 * @param {object} response - Proxy response object to validate
 * @returns {object} - Validation result
 */
function validateProxyResponse(response) {
    return validate('api-proxy#/definitions/proxyResponseUnion', response);
}

/**
 * Validate Entity
 * @param {object} entity - Entity object to validate
 * @returns {object} - Validation result
 */
function validateEntity(entity) {
    return validate('api-entities#/definitions/entity', entity);
}

/**
 * Validate List Entities Response
 * @param {object} response - List entities response object to validate
 * @returns {object} - Validation result
 */
function validateListEntitiesResponse(response) {
    return validate('api-entities#/definitions/listEntitiesResponse', response);
}

/**
 * Validate Create Entity Request
 * @param {object} request - Create entity request object to validate
 * @returns {object} - Validation result
 */
function validateCreateEntityRequest(request) {
    return validate('api-entities#/definitions/createEntityRequest', request);
}

/**
 * Validate Create Entity Response
 * @param {object} response - Create entity response object to validate
 * @returns {object} - Validation result
 */
function validateCreateEntityResponse(response) {
    return validate('api-entities#/definitions/createEntityResponse', response);
}

/**
 * Validate Entity Type
 * @param {object} entityType - Entity type object to validate
 * @returns {object} - Validation result
 */
function validateEntityType(entityType) {
    return validate('api-entities#/definitions/entityType', entityType);
}

/**
 * Validate List Entity Types Response
 * @param {object} response - List entity types response object to validate
 * @returns {object} - Validation result
 */
function validateListEntityTypesResponse(response) {
    return validate('api-entities#/definitions/listEntityTypesResponse', response);
}

/**
 * Validate Get Entity Type Response
 * @param {object} response - Get entity type response object to validate
 * @returns {object} - Validation result
 */
function validateGetEntityTypeResponse(response) {
    return validate('api-entities#/definitions/getEntityTypeResponse', response);
}

/**
 * Validate Reauthorize Entity Request
 * @param {object} request - Reauthorize entity request object to validate
 * @returns {object} - Validation result
 */
function validateReauthorizeEntityRequest(request) {
    return validate('api-entities#/definitions/reauthorizeEntityRequest', request);
}

/**
 * Validate Reauthorize Entity Response
 * @param {object} response - Reauthorize entity response object to validate
 * @returns {object} - Validation result
 */
function validateReauthorizeEntityResponse(response) {
    return validate('api-entities#/definitions/reauthorizeEntityResponse', response);
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
    // Validation functions
    validate,
    validateAppDefinition,
    validateIntegrationDefinition,
    validateApiModuleDefinition,
    validateServerlessConfig,
    validateEnvironmentConfig,
    validateCoreModels,
    validateAuthorizationRequirements,
    validateAuthorizationRequest,
    validateAuthorizationResponse,
    validateAuthorizationSession,
    validateCredential,
    validateListCredentialsResponse,
    validateGetCredentialResponse,
    validateDeleteCredentialResponse,
    validateReauthorizeCredentialRequest,
    validateReauthorizeCredentialResponse,
    validateProxyRequest,
    validateProxyResponse,
    validateEntity,
    validateListEntitiesResponse,
    validateCreateEntityRequest,
    validateCreateEntityResponse,
    validateEntityType,
    validateListEntityTypesResponse,
    validateGetEntityTypeResponse,
    validateReauthorizeEntityRequest,
    validateReauthorizeEntityResponse,
    getSchemas,
    getSchema,
    formatErrors,
    schemas,
    ajv,

    // Middleware exports
    middleware: schemaValidationMiddleware,
    validateBody: schemaValidationMiddleware.validateBody,
    validateQuery: schemaValidationMiddleware.validateQuery,
    validateParams: schemaValidationMiddleware.validateParams,
    validateResponse: schemaValidationMiddleware.validateResponse,
    SchemaRefs: schemaValidationMiddleware.SchemaRefs,
    SchemaValidationError: schemaValidationMiddleware.SchemaValidationError
};