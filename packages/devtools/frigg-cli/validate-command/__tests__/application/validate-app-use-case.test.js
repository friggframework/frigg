const { ValidateAppUseCase } = require('../../application/use-cases/validate-app-use-case');

describe('ValidateAppUseCase', () => {
    let useCase;
    let mockAppDefinitionValidator;
    let mockIntegrationClassValidator;

    beforeEach(() => {
        mockAppDefinitionValidator = {
            validate: jest.fn()
        };
        mockIntegrationClassValidator = {
            validate: jest.fn()
        };
        useCase = new ValidateAppUseCase({
            appDefinitionValidator: mockAppDefinitionValidator,
            integrationClassValidator: mockIntegrationClassValidator
        });
    });

    describe('execute', () => {
        it('validates app definition structure', async () => {
            const { ValidationResult } = require('../../domain/entities/validation-result');
            mockAppDefinitionValidator.validate.mockReturnValue(ValidationResult.create());
            mockIntegrationClassValidator.validate.mockReturnValue(ValidationResult.create());

            const definition = { integrations: [] };
            await useCase.execute({ definition });

            expect(mockAppDefinitionValidator.validate).toHaveBeenCalledWith(definition);
        });

        it('validates each integration class', async () => {
            const { ValidationResult } = require('../../domain/entities/validation-result');
            mockAppDefinitionValidator.validate.mockReturnValue(ValidationResult.create());
            mockIntegrationClassValidator.validate.mockReturnValue(ValidationResult.create());

            class Int1 { static Definition = { name: 'int1' }; }
            class Int2 { static Definition = { name: 'int2' }; }
            const definition = { integrations: [Int1, Int2] };

            await useCase.execute({ definition });

            expect(mockIntegrationClassValidator.validate).toHaveBeenCalledWith(Int1, 0);
            expect(mockIntegrationClassValidator.validate).toHaveBeenCalledWith(Int2, 1);
        });

        it('merges all validation results', async () => {
            const { ValidationResult } = require('../../domain/entities/validation-result');
            const { ValidationError } = require('../../domain/value-objects/validation-error');

            const appError = ValidationError.create({ path: 'database', message: 'missing', severity: 'error' });
            const intError = ValidationError.create({ path: 'integrations[0]', message: 'invalid', severity: 'error' });

            mockAppDefinitionValidator.validate.mockReturnValue(
                ValidationResult.create({ errors: [appError] })
            );
            mockIntegrationClassValidator.validate.mockReturnValue(
                ValidationResult.create({ errors: [intError] })
            );

            class Int1 { static Definition = { name: 'int1' }; }
            const definition = { integrations: [Int1] };

            const result = await useCase.execute({ definition });

            expect(result.getErrors()).toHaveLength(2);
        });

        it('returns valid result when no errors', async () => {
            const { ValidationResult } = require('../../domain/entities/validation-result');
            mockAppDefinitionValidator.validate.mockReturnValue(ValidationResult.create());
            mockIntegrationClassValidator.validate.mockReturnValue(ValidationResult.create());

            const definition = { integrations: [] };
            const result = await useCase.execute({ definition });

            expect(result.isValid()).toBe(true);
        });

        it('adds context with definition metadata', async () => {
            const { ValidationResult } = require('../../domain/entities/validation-result');
            mockAppDefinitionValidator.validate.mockReturnValue(ValidationResult.create());

            const definition = { integrations: [] };
            const result = await useCase.execute({ definition, appPath: '/app/backend' });

            expect(result.getContext()).toMatchObject({ appPath: '/app/backend' });
        });
    });

    describe('error handling', () => {
        it('handles validator throwing error', async () => {
            mockAppDefinitionValidator.validate.mockImplementation(() => {
                throw new Error('Validator crashed');
            });

            const definition = { integrations: [] };

            await expect(useCase.execute({ definition }))
                .rejects.toThrow('Validator crashed');
        });
    });
});
