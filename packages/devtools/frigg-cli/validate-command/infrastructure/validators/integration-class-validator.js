const { validateIntegrationDefinition } = require('@friggframework/schemas');
const { ValidationResult } = require('../../domain/entities/validation-result');
const { ValidationError } = require('../../domain/value-objects/validation-error');
const { FixSuggestion } = require('../../domain/value-objects/fix-suggestion');

const LIFECYCLE_METHODS = ['onCreate', 'getConfigOptions', 'testAuth'];

class IntegrationClassValidator {
    validate(integrationClass, index) {
        const result = ValidationResult.create();
        const prefix = `integrations[${index}]`;

        if (typeof integrationClass !== 'function') {
            result.addError(ValidationError.create({
                path: prefix,
                message: 'Integration must be a class (function)',
                severity: 'error',
                code: 'INVALID_TYPE'
            }));
            return result;
        }

        if (!integrationClass.Definition) {
            result.addError(ValidationError.create({
                path: `${prefix}.Definition`,
                message: 'Integration class must have a static Definition property',
                severity: 'error',
                code: 'MISSING_DEFINITION',
                fix: FixSuggestion.create({
                    action: 'add',
                    description: 'Add static Definition property to integration class',
                    codeSnippet: `static Definition = {\n    name: 'my-integration',\n    version: '1.0.0',\n    modules: {}\n};`
                })
            }));
            return result;
        }

        this._validateDefinitionWithSchema(integrationClass.Definition, prefix, result);
        this._validateModuleNames(integrationClass.Definition, prefix, result);
        this._validateLifecycleMethods(integrationClass, prefix, result);

        return result;
    }

    _validateDefinitionWithSchema(definition, prefix, result) {
        const schemaResult = validateIntegrationDefinition(definition);

        if (!schemaResult.valid && schemaResult.errors) {
            schemaResult.errors.forEach(error => {
                const path = error.instancePath
                    ? `${prefix}.Definition${error.instancePath.replace(/\//g, '.')}`
                    : `${prefix}.Definition`;

                result.addError(ValidationError.create({
                    path,
                    message: this._formatSchemaErrorMessage(error),
                    severity: 'error',
                    code: error.keyword?.toUpperCase() || 'SCHEMA_ERROR'
                }));
            });
        }
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

    _validateModuleNames(definition, prefix, result) {
        if (!definition.modules) {
            return;
        }

        Object.entries(definition.modules).forEach(([moduleName, moduleConfig]) => {
            // Check for moduleName (the correct property per API module schema and core Module class)
            // Note: getName() method returns definition.moduleName, not definition.name
            if (moduleConfig.definition && !moduleConfig.definition.moduleName) {
                result.addError(ValidationError.create({
                    path: `${prefix}.Definition.modules.${moduleName}.definition.moduleName`,
                    message: `Module ${moduleName} definition should have a moduleName property`,
                    severity: 'warning',
                    code: 'MISSING_MODULE_NAME'
                }));
            }
        });
    }

    _validateLifecycleMethods(integrationClass, prefix, result) {
        const proto = integrationClass.prototype;

        LIFECYCLE_METHODS.forEach(method => {
            if (typeof proto[method] !== 'function') {
                result.addError(ValidationError.create({
                    path: `${prefix}.${method}`,
                    message: `Integration should implement ${method}() method`,
                    severity: 'warning',
                    code: 'MISSING_METHOD'
                }));
            }
        });
    }
}

module.exports = { IntegrationClassValidator };
