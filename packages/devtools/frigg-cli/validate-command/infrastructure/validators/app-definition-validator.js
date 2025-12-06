const { ValidationResult } = require('../../domain/entities/validation-result');
const { ValidationError } = require('../../domain/value-objects/validation-error');
const { FixSuggestion } = require('../../domain/value-objects/fix-suggestion');

const VALID_DB_TYPES = ['mongoDB', 'postgres'];
const VALID_USER_MODELS = ['mongoose', 'prisma'];

class AppDefinitionValidator {
    validate(definition) {
        const result = ValidationResult.create();

        this._validateIntegrations(definition, result);
        this._validateDatabase(definition, result);
        this._validateUser(definition, result);

        return result;
    }

    _validateIntegrations(definition, result) {
        if (!definition.integrations) {
            result.addError(ValidationError.create({
                path: 'integrations',
                message: 'integrations is required',
                severity: 'error',
                code: 'REQUIRED_FIELD',
                fix: FixSuggestion.create({
                    action: 'add',
                    description: 'Add integrations array to definition',
                    template: { integrations: [] }
                })
            }));
            return;
        }

        if (!Array.isArray(definition.integrations)) {
            result.addError(ValidationError.create({
                path: 'integrations',
                message: 'integrations must be an array',
                severity: 'error',
                code: 'INVALID_TYPE'
            }));
            return;
        }

        const names = [];
        definition.integrations.forEach((integration, index) => {
            if (!integration.Definition) {
                result.addError(ValidationError.create({
                    path: `integrations[${index}]`,
                    message: 'Integration class must have a static Definition property',
                    severity: 'error',
                    code: 'MISSING_DEFINITION'
                }));
                return;
            }

            if (!integration.Definition.name) {
                result.addError(ValidationError.create({
                    path: `integrations[${index}].Definition.name`,
                    message: 'Integration Definition must have a name',
                    severity: 'error',
                    code: 'REQUIRED_FIELD'
                }));
                return;
            }

            const name = integration.Definition.name;
            if (names.includes(name)) {
                result.addError(ValidationError.create({
                    path: `integrations[${index}].Definition.name`,
                    message: `duplicate integration name: ${name}`,
                    severity: 'warning',
                    code: 'DUPLICATE_NAME'
                }));
            }
            names.push(name);
        });
    }

    _validateDatabase(definition, result) {
        if (!definition.database) {
            result.addError(ValidationError.create({
                path: 'database',
                message: 'No database configuration found',
                severity: 'warning',
                code: 'MISSING_CONFIG',
                fix: FixSuggestion.create({
                    action: 'add',
                    description: 'Add database configuration',
                    template: { database: { mongoDB: { enable: true } } }
                })
            }));
            return;
        }

        const dbKeys = Object.keys(definition.database);
        const validKeys = dbKeys.filter(k => VALID_DB_TYPES.includes(k));

        if (validKeys.length === 0) {
            result.addError(ValidationError.create({
                path: 'database',
                message: `Invalid database type. Must be one of: ${VALID_DB_TYPES.join(', ')}`,
                severity: 'error',
                code: 'INVALID_DB_TYPE'
            }));
        }
    }

    _validateUser(definition, result) {
        if (!definition.user) {
            return;
        }

        if (definition.user.model && !VALID_USER_MODELS.includes(definition.user.model)) {
            result.addError(ValidationError.create({
                path: 'user.model',
                message: `Invalid user model: ${definition.user.model}. Must be one of: ${VALID_USER_MODELS.join(', ')}`,
                severity: 'error',
                code: 'INVALID_USER_MODEL'
            }));
        }
    }
}

module.exports = { AppDefinitionValidator };
