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

        this._validateDefinition(integrationClass.Definition, prefix, result);
        this._validateModules(integrationClass.Definition, prefix, result);
        this._validateLifecycleMethods(integrationClass, prefix, result);

        return result;
    }

    _validateDefinition(definition, prefix, result) {
        if (!definition.name) {
            result.addError(ValidationError.create({
                path: `${prefix}.Definition.name`,
                message: 'Definition must have a name property',
                severity: 'error',
                code: 'REQUIRED_FIELD'
            }));
            return;
        }

        if (typeof definition.name !== 'string') {
            result.addError(ValidationError.create({
                path: `${prefix}.Definition.name`,
                message: 'Definition.name must be a string',
                severity: 'error',
                code: 'INVALID_TYPE'
            }));
        }
    }

    _validateModules(definition, prefix, result) {
        if (!definition.modules) {
            return;
        }

        Object.entries(definition.modules).forEach(([moduleName, moduleConfig]) => {
            const modulePath = `${prefix}.Definition.modules.${moduleName}`;

            if (!moduleConfig.definition) {
                result.addError(ValidationError.create({
                    path: `${modulePath}.definition`,
                    message: `Module ${moduleName} must have a definition property`,
                    severity: 'error',
                    code: 'REQUIRED_FIELD'
                }));
                return;
            }

            if (!moduleConfig.definition.name) {
                result.addError(ValidationError.create({
                    path: `${modulePath}.definition.name`,
                    message: `Module ${moduleName} definition should have a name`,
                    severity: 'warning',
                    code: 'MISSING_NAME'
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
