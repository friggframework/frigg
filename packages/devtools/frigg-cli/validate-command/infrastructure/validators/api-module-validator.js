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
        const schemaResult = validateApiModuleDefinition(definition);

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
