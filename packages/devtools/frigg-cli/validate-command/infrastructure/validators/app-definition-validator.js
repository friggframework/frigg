const { validateAppDefinition } = require('@friggframework/schemas');
const { ValidationResult } = require('../../domain/entities/validation-result');
const { ValidationError } = require('../../domain/value-objects/validation-error');

class AppDefinitionValidator {
    validate(definition) {
        const result = ValidationResult.create();

        const schemaResult = validateAppDefinition(definition);

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
