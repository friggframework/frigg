const { ValidationResult } = require('../../domain/entities/validation-result');

class ValidateAppUseCase {
    constructor({ appDefinitionValidator, integrationClassValidator, apiModuleValidator }) {
        this.appDefinitionValidator = appDefinitionValidator;
        this.integrationClassValidator = integrationClassValidator;
        this.apiModuleValidator = apiModuleValidator;
    }

    async execute({ definition, appPath }) {
        let result = ValidationResult.create({
            context: { appPath }
        });

        const appResult = this.appDefinitionValidator.validate(definition);
        result = result.merge(appResult);

        if (definition.integrations && Array.isArray(definition.integrations)) {
            definition.integrations.forEach((integration, index) => {
                const integrationResult = this.integrationClassValidator.validate(integration, index);
                result = result.merge(integrationResult);

                // Validate API modules within the integration
                if (this.apiModuleValidator && integration.Definition) {
                    const moduleResult = this.apiModuleValidator.validate(integration.Definition, index);
                    result = result.merge(moduleResult);
                }
            });
        }

        return result;
    }
}

module.exports = { ValidateAppUseCase };
