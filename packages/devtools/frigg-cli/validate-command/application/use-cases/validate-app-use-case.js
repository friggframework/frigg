const { ValidationResult } = require('../../domain/entities/validation-result');

class ValidateAppUseCase {
    constructor({ appDefinitionValidator, integrationClassValidator }) {
        this.appDefinitionValidator = appDefinitionValidator;
        this.integrationClassValidator = integrationClassValidator;
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
            });
        }

        return result;
    }
}

module.exports = { ValidateAppUseCase };
