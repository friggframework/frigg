/**
 * Schema Validation Middleware for Express
 *
 * Provides request and response validation against JSON schemas using AJV.
 * Like TypeScript for APIs - enforces contracts at runtime.
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
    // Note: coerceTypes disabled to avoid conflicts with oneOf schemas
});
addFormats(ajv);

// Load all schemas
const schemaDir = path.join(__dirname, '..', 'schemas');
const schemaFiles = [
    'api-entities.schema.json',
    'api-credentials.schema.json',
    'api-proxy.schema.json',
    'api-authorization.schema.json'
];

schemaFiles.forEach(file => {
    const schemaPath = path.join(schemaDir, file);
    if (fs.existsSync(schemaPath)) {
        const schemaContent = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
        const schemaName = file.replace('.schema.json', '');
        ajv.addSchema(schemaContent, schemaName);
    }
});

/**
 * Validation error class for schema validation failures
 */
class SchemaValidationError extends Error {
    constructor(message, errors, location) {
        super(message);
        this.name = 'SchemaValidationError';
        this.errors = errors;
        this.location = location; // 'body', 'query', 'params', 'response'
        this.statusCode = location === 'response' ? 500 : 400;
    }

    toJSON() {
        return {
            error: 'ValidationError',
            message: this.message,
            location: this.location,
            details: this.errors.map(err => ({
                path: err.instancePath || 'root',
                message: err.message,
                params: err.params
            }))
        };
    }
}

/**
 * Format AJV errors into human-readable messages
 * @param {Array} errors - AJV validation errors
 * @returns {string} - Formatted error message
 */
function formatValidationErrors(errors) {
    if (!errors || errors.length === 0) {
        return 'Unknown validation error';
    }

    return errors.map(error => {
        const path = error.instancePath || 'root';
        const message = error.message;
        const allowedValues = error.params?.allowedValues
            ? ` (allowed: ${error.params.allowedValues.join(', ')})`
            : '';
        return `${path}: ${message}${allowedValues}`;
    }).join('; ');
}

/**
 * Get a compiled validator for a schema reference
 * @param {string} schemaRef - Schema reference (e.g., 'api-entities#/definitions/entity')
 * @returns {Function} - Compiled AJV validator
 */
function getValidator(schemaRef) {
    const validator = ajv.getSchema(schemaRef);
    if (!validator) {
        throw new Error(`Schema not found: ${schemaRef}`);
    }
    return validator;
}

/**
 * Validate request body against a schema
 * @param {string} schemaRef - Schema reference
 * @param {Object} options - Validation options
 * @param {boolean} options.strict - If true, throws on validation failure (default: true)
 * @param {boolean} options.coerceTypes - If true, coerces types (default: false for body)
 * @returns {Function} - Express middleware
 */
function validateBody(schemaRef, options = {}) {
    const { strict = true } = options;

    return (req, res, next) => {
        try {
            const validator = getValidator(schemaRef);
            const valid = validator(req.body);

            if (!valid) {
                const error = new SchemaValidationError(
                    `Request body validation failed: ${formatValidationErrors(validator.errors)}`,
                    validator.errors,
                    'body'
                );

                if (strict) {
                    return res.status(400).json(error.toJSON());
                }

                // Non-strict: attach errors but continue
                req.validationErrors = req.validationErrors || {};
                req.validationErrors.body = validator.errors;
            }

            next();
        } catch (err) {
            next(err);
        }
    };
}

/**
 * Validate query parameters against a schema
 * @param {string} schemaRef - Schema reference
 * @param {Object} options - Validation options
 * @returns {Function} - Express middleware
 */
function validateQuery(schemaRef, options = {}) {
    const { strict = true } = options;

    return (req, res, next) => {
        try {
            const validator = getValidator(schemaRef);
            const valid = validator(req.query);

            if (!valid) {
                const error = new SchemaValidationError(
                    `Query parameter validation failed: ${formatValidationErrors(validator.errors)}`,
                    validator.errors,
                    'query'
                );

                if (strict) {
                    return res.status(400).json(error.toJSON());
                }

                req.validationErrors = req.validationErrors || {};
                req.validationErrors.query = validator.errors;
            }

            next();
        } catch (err) {
            next(err);
        }
    };
}

/**
 * Validate route parameters against a schema
 * @param {string} schemaRef - Schema reference
 * @param {Object} options - Validation options
 * @returns {Function} - Express middleware
 */
function validateParams(schemaRef, options = {}) {
    const { strict = true } = options;

    return (req, res, next) => {
        try {
            const validator = getValidator(schemaRef);
            const valid = validator(req.params);

            if (!valid) {
                const error = new SchemaValidationError(
                    `Route parameter validation failed: ${formatValidationErrors(validator.errors)}`,
                    validator.errors,
                    'params'
                );

                if (strict) {
                    return res.status(400).json(error.toJSON());
                }

                req.validationErrors = req.validationErrors || {};
                req.validationErrors.params = validator.errors;
            }

            next();
        } catch (err) {
            next(err);
        }
    };
}

/**
 * Validate response body against a schema (for development/testing)
 * Wraps res.json() to validate response data
 * @param {string} schemaRef - Schema reference
 * @param {Object} options - Validation options
 * @returns {Function} - Express middleware
 */
function validateResponse(schemaRef, options = {}) {
    const { strict = false, logErrors = true } = options;

    return (req, res, next) => {
        const originalJson = res.json.bind(res);

        res.json = function(data) {
            try {
                const validator = getValidator(schemaRef);
                const valid = validator(data);

                if (!valid) {
                    const errorMessage = formatValidationErrors(validator.errors);

                    if (logErrors) {
                        console.error(`Response validation failed for ${req.method} ${req.path}:`, errorMessage);
                    }

                    if (strict) {
                        const error = new SchemaValidationError(
                            `Response validation failed: ${errorMessage}`,
                            validator.errors,
                            'response'
                        );
                        return originalJson.call(res.status(500), error.toJSON());
                    }

                    // Non-strict: log but continue
                    // Optionally add validation metadata to response
                    if (options.includeMetadata) {
                        data._validation = {
                            valid: false,
                            errors: validator.errors
                        };
                    }
                }
            } catch (err) {
                if (logErrors) {
                    console.error('Response validation error:', err.message);
                }
            }

            return originalJson.call(res, data);
        };

        next();
    };
}

/**
 * Combined validation middleware - validates request and response
 * @param {Object} config - Validation configuration
 * @param {string} config.body - Schema ref for body validation
 * @param {string} config.query - Schema ref for query validation
 * @param {string} config.params - Schema ref for params validation
 * @param {string} config.response - Schema ref for response validation
 * @param {Object} config.options - Validation options
 * @returns {Array<Function>} - Array of Express middleware
 */
function validate(config = {}) {
    const middlewares = [];
    const { options = {} } = config;

    if (config.body) {
        middlewares.push(validateBody(config.body, options));
    }

    if (config.query) {
        middlewares.push(validateQuery(config.query, options));
    }

    if (config.params) {
        middlewares.push(validateParams(config.params, options));
    }

    if (config.response) {
        middlewares.push(validateResponse(config.response, options));
    }

    return middlewares;
}

/**
 * Schema reference helpers for common API schemas
 */
const SchemaRefs = {
    // Entities
    entity: 'api-entities#/definitions/entity',
    listEntitiesResponse: 'api-entities#/definitions/listEntitiesResponse',
    createEntityRequest: 'api-entities#/definitions/createEntityRequest',
    createEntityResponse: 'api-entities#/definitions/createEntityResponse',
    entityType: 'api-entities#/definitions/entityType',
    listEntityTypesResponse: 'api-entities#/definitions/listEntityTypesResponse',
    getEntityTypeResponse: 'api-entities#/definitions/getEntityTypeResponse',
    reauthorizeEntityRequest: 'api-entities#/definitions/reauthorizeEntityRequest',
    reauthorizeEntityResponse: 'api-entities#/definitions/reauthorizeEntityResponse',

    // Credentials
    credential: 'api-credentials#/definitions/credential',
    listCredentialsResponse: 'api-credentials#/definitions/listCredentialsResponse',
    getCredentialResponse: 'api-credentials#/definitions/getCredentialResponse',
    deleteCredentialResponse: 'api-credentials#/definitions/deleteCredentialResponse',
    reauthorizeCredentialRequest: 'api-credentials#/definitions/reauthorizeCredentialRequest',
    reauthorizeCredentialResponse: 'api-credentials#/definitions/reauthorizeCredentialResponse',

    // Proxy
    proxyRequest: 'api-proxy#/definitions/proxyRequest',
    proxyResponse: 'api-proxy#/definitions/proxyResponse',
    proxyErrorResponse: 'api-proxy#/definitions/proxyErrorResponse',
    proxyResponseUnion: 'api-proxy#/definitions/proxyResponseUnion',

    // Authorization
    authorizationRequirements: 'api-authorization#/definitions/authorizationRequirements',
    authorizationRequest: 'api-authorization#/definitions/authorizationRequest',
    authorizationResponse: 'api-authorization#/definitions/authorizationResponse',
    authorizationSession: 'api-authorization#/definitions/authorizationSession',
    getEntityTypeRequirementsResponse: 'api-authorization#/definitions/getEntityTypeRequirementsResponse'
};

/**
 * Precompiled validators for performance
 */
const Validators = {};

// Lazy-load validators on first use
function getCompiledValidator(name) {
    if (!Validators[name]) {
        const ref = SchemaRefs[name];
        if (!ref) {
            throw new Error(`Unknown schema name: ${name}`);
        }
        Validators[name] = getValidator(ref);
    }
    return Validators[name];
}

/**
 * Direct validation functions (not middleware)
 * Useful for testing and manual validation
 */
function validateData(schemaName, data) {
    const validator = getCompiledValidator(schemaName);
    const valid = validator(data);
    return {
        valid,
        errors: valid ? null : validator.errors,
        formatted: valid ? null : formatValidationErrors(validator.errors)
    };
}

module.exports = {
    // Middleware
    validateBody,
    validateQuery,
    validateParams,
    validateResponse,
    validate,

    // Direct validation
    validateData,
    getValidator,
    formatValidationErrors,

    // Schema references
    SchemaRefs,

    // Error class
    SchemaValidationError,

    // AJV instance (for advanced use)
    ajv
};
