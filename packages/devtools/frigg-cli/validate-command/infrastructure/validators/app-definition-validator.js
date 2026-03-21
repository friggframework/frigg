const { validateAppDefinition } = require('@friggframework/schemas');
const { ValidationResult } = require('../../domain/entities/validation-result');
const { ValidationError } = require('../../domain/value-objects/validation-error');

class AppDefinitionValidator {
    validate(definition) {
        const result = ValidationResult.create();

        // Create a sanitized copy for JSON Schema validation
        // Integrations contain classes/functions which JSON Schema can't validate
        // IntegrationClassValidator handles those separately
        const sanitizedDefinition = this._sanitizeForSchemaValidation(definition);
        const schemaResult = validateAppDefinition(sanitizedDefinition);

        if (!schemaResult.valid && schemaResult.errors) {
            schemaResult.errors.forEach(error => {
                result.addError(ValidationError.create({
                    path: this._convertPath(error.instancePath) || 'root',
                    message: this._formatErrorMessage(error),
                    severity: 'error',
                    code: error.keyword?.toUpperCase() || 'SCHEMA_ERROR'
                }));
            });
        }

        this._validateIntegrationDuplicates(definition, result);
        this._validateIntegrationDefinitions(definition, result);

        return result;
    }

    /**
     * Create a copy of the definition safe for JSON Schema validation.
     * Replaces integration classes with stub objects since JSON Schema
     * cannot validate JavaScript classes/functions.
     */
    _sanitizeForSchemaValidation(definition) {
        if (!definition) return definition;

        const sanitized = { ...definition };

        // Replace integration classes with stub objects
        // The actual class validation is handled by IntegrationClassValidator
        if (Array.isArray(definition.integrations)) {
            sanitized.integrations = definition.integrations.map(integration => {
                if (typeof integration === 'function') {
                    // Return a stub object representing the class
                    return { _isClass: true, name: integration.name };
                }
                return integration;
            });
        }

        // Sanitize extensions — strip functions (bootstrap, routes.handler)
        // that JSON Schema cannot validate
        if (Array.isArray(definition.extensions)) {
            sanitized.extensions = definition.extensions.map(ext => {
                const sanitizedExt = { ...ext };
                // Remove function properties
                if (typeof sanitizedExt.bootstrap === 'function') {
                    delete sanitizedExt.bootstrap;
                }
                if (sanitizedExt.routes && typeof sanitizedExt.routes.handler === 'function') {
                    sanitizedExt.routes = { ...sanitizedExt.routes };
                    delete sanitizedExt.routes.handler;
                }
                return sanitizedExt;
            });
        }

        return sanitized;
    }

    _convertPath(jsonPointerPath) {
        if (!jsonPointerPath) return '';
        return jsonPointerPath
            .replace(/^\//, '')
            .replace(/\/(\d+)/g, '[$1]')
            .replace(/\//g, '.');
    }

    _formatErrorMessage(error) {
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

    _validateIntegrationDefinitions(definition, result) {
        if (!definition.integrations || !Array.isArray(definition.integrations)) {
            return;
        }

        definition.integrations.forEach((integration, index) => {
            if (typeof integration === 'function') {
                if (!integration.Definition) {
                    result.addError(ValidationError.create({
                        path: `integrations[${index}]`,
                        message: 'Integration class must have a static Definition property',
                        severity: 'error',
                        code: 'MISSING_DEFINITION'
                    }));
                } else if (!integration.Definition.name) {
                    result.addError(ValidationError.create({
                        path: `integrations[${index}].Definition.name`,
                        message: 'Integration Definition must have a name property',
                        severity: 'error',
                        code: 'REQUIRED_FIELD'
                    }));
                }
            }
        });
    }

    _validateIntegrationDuplicates(definition, result) {
        if (!definition.integrations || !Array.isArray(definition.integrations)) {
            return;
        }

        const names = [];
        definition.integrations.forEach((integration, index) => {
            const name = integration.Definition?.name;
            if (name) {
                if (names.includes(name)) {
                    result.addError(ValidationError.create({
                        path: `integrations[${index}].Definition.name`,
                        message: `duplicate integration name: ${name}`,
                        severity: 'warning',
                        code: 'DUPLICATE_NAME'
                    }));
                }
                names.push(name);
            }
        });
    }
}

module.exports = { AppDefinitionValidator };
