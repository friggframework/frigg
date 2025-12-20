const { validateApiModuleDefinition } = require('@friggframework/schemas');
const { ValidationResult } = require('../../domain/entities/validation-result');
const { ValidationError } = require('../../domain/value-objects/validation-error');

const REQUIRED_MODULE_METHODS = ['getToken', 'getEntityDetails', 'getCredentialDetails'];

class ApiModuleValidator {
    /**
     * Validate API module definitions within an integration
     * @param {object} integrationDefinition - The integration's Definition object
     * @param {number} integrationIndex - Index of the integration in the app
     * @returns {ValidationResult}
     */
    validate(integrationDefinition, integrationIndex) {
        const result = ValidationResult.create();
        const prefix = `integrations[${integrationIndex}].Definition.modules`;

        if (!integrationDefinition.modules || typeof integrationDefinition.modules !== 'object') {
            return result;
        }

        Object.entries(integrationDefinition.modules).forEach(([moduleName, moduleConfig]) => {
            const modulePath = `${prefix}.${moduleName}`;

            if (!moduleConfig.definition) {
                result.addError(ValidationError.create({
                    path: `${modulePath}.definition`,
                    message: `Module '${moduleName}' must have a definition property`,
                    severity: 'error',
                    code: 'MISSING_DEFINITION'
                }));
                return;
            }

            this._validateModuleDefinitionWithSchema(moduleConfig.definition, modulePath, moduleName, result);
            this._validateRequiredMethods(moduleConfig.definition, modulePath, moduleName, result);
            this._validateApiPropertiesToPersist(moduleConfig.definition, modulePath, moduleName, result);
        });

        return result;
    }

    _validateModuleDefinitionWithSchema(definition, modulePath, moduleName, result) {
        // Sanitize the definition before JSON Schema validation
        // API module definitions contain functions and classes that JSON Schema can't validate
        const sanitizedDefinition = this._sanitizeForSchemaValidation(definition);
        const schemaResult = validateApiModuleDefinition(sanitizedDefinition);

        if (!schemaResult.valid && schemaResult.errors) {
            schemaResult.errors.forEach(error => {
                const path = error.instancePath
                    ? `${modulePath}.definition${error.instancePath.replace(/\//g, '.')}`
                    : `${modulePath}.definition`;

                result.addError(ValidationError.create({
                    path,
                    message: this._formatSchemaErrorMessage(error),
                    severity: 'error',
                    code: error.keyword?.toUpperCase() || 'SCHEMA_ERROR'
                }));
            });
        }
    }

    /**
     * Create a copy of the module definition safe for JSON Schema validation.
     * Converts functions to descriptors but preserves all properties so that
     * unknown properties can be properly rejected by the schema.
     */
    _sanitizeForSchemaValidation(definition) {
        if (!definition) return definition;

        const sanitized = {};

        // Copy ALL properties, converting functions/classes to descriptors
        // This allows JSON Schema to properly reject unknown properties
        for (const key of Object.keys(definition)) {
            sanitized[key] = this._sanitizeValue(definition[key]);
        }

        return sanitized;
    }

    /**
     * Recursively sanitize a value for JSON Schema validation.
     * Functions become {type: "function"} descriptors.
     * Classes become {type: "object"} descriptors.
     */
    _sanitizeValue(value) {
        if (value === null || value === undefined) {
            return value;
        }

        // Convert functions to descriptors
        if (typeof value === 'function') {
            return { type: 'function', name: value.name || 'anonymous' };
        }

        // Handle arrays
        if (Array.isArray(value)) {
            return value.map(item => this._sanitizeValue(item));
        }

        // Handle objects (but not class instances with constructors other than Object)
        if (typeof value === 'object') {
            // Check if it's a class instance (not a plain object)
            if (value.constructor && value.constructor.name !== 'Object') {
                return { type: 'object', className: value.constructor.name };
            }

            // Recursively sanitize plain objects
            const sanitizedObj = {};
            for (const [key, val] of Object.entries(value)) {
                sanitizedObj[key] = this._sanitizeValue(val);
            }
            return sanitizedObj;
        }

        // Primitives pass through unchanged
        return value;
    }

    _formatSchemaErrorMessage(error) {
        let message = error.message;
        if (error.params?.allowedValues) {
            message += ` (allowed: ${error.params.allowedValues.join(', ')})`;
        }
        if (error.params?.additionalProperty) {
            message += `: ${error.params.additionalProperty}`;
        }
        if (error.params?.missingProperty) {
            message = `must have required property '${error.params.missingProperty}'`;
        }
        return message;
    }

    _validateRequiredMethods(definition, modulePath, moduleName, result) {
        if (!definition.requiredAuthMethods) {
            return;
        }

        REQUIRED_MODULE_METHODS.forEach(method => {
            if (!definition.requiredAuthMethods[method]) {
                result.addError(ValidationError.create({
                    path: `${modulePath}.definition.requiredAuthMethods.${method}`,
                    message: `Module '${moduleName}' should implement ${method} method`,
                    severity: 'warning',
                    code: 'MISSING_METHOD'
                }));
            }
        });
    }

    _validateApiPropertiesToPersist(definition, modulePath, moduleName, result) {
        const props = definition.requiredAuthMethods?.apiPropertiesToPersist;

        if (!props) {
            return;
        }

        if (!props.credential || !Array.isArray(props.credential) || props.credential.length === 0) {
            result.addError(ValidationError.create({
                path: `${modulePath}.definition.requiredAuthMethods.apiPropertiesToPersist.credential`,
                message: `Module '${moduleName}' should specify credential properties to persist`,
                severity: 'warning',
                code: 'MISSING_CREDENTIAL_PROPS'
            }));
        }

        if (!props.entity || !Array.isArray(props.entity) || props.entity.length === 0) {
            result.addError(ValidationError.create({
                path: `${modulePath}.definition.requiredAuthMethods.apiPropertiesToPersist.entity`,
                message: `Module '${moduleName}' should specify entity properties to persist`,
                severity: 'warning',
                code: 'MISSING_ENTITY_PROPS'
            }));
        }
    }
}

module.exports = { ApiModuleValidator };
