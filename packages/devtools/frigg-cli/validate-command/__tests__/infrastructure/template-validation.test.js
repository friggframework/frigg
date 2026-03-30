/**
 * Template Validation Tests
 *
 * Validates that the frigg init templates produce valid configurations
 * when run through the validator.
 */

const path = require('path');
const { AppDefinitionValidator } = require('../../infrastructure/validators/app-definition-validator');
const { IntegrationClassValidator } = require('../../infrastructure/validators/integration-class-validator');
const { ApiModuleValidator } = require('../../infrastructure/validators/api-module-validator');

// Resolve template paths relative to frigg-cli package root
const FRIGG_CLI_ROOT = path.resolve(__dirname, '../../..');
const TEMPLATES_DIR = path.join(FRIGG_CLI_ROOT, 'templates');

describe('Template Validation', () => {
    let appDefinitionValidator;
    let integrationClassValidator;
    let apiModuleValidator;

    beforeEach(() => {
        appDefinitionValidator = new AppDefinitionValidator();
        integrationClassValidator = new IntegrationClassValidator();
        apiModuleValidator = new ApiModuleValidator();
    });

    describe('backend/index.js template', () => {
        // Load the actual template
        const templatePath = path.join(TEMPLATES_DIR, 'backend/index.js');
        let templateModule;

        beforeAll(() => {
            // Clear require cache to ensure fresh load
            delete require.cache[require.resolve(templatePath)];
            templateModule = require(templatePath);
        });

        it('exports a Definition property', () => {
            expect(templateModule.Definition).toBeDefined();
            expect(typeof templateModule.Definition).toBe('object');
        });

        it('has valid app definition structure', () => {
            const result = appDefinitionValidator.validate(templateModule.Definition);

            // Log errors for debugging
            if (!result.isValid()) {
                console.log('App Definition Errors:', result.getErrors().map(e => `${e.path}: ${e.message}`));
            }

            expect(result.isValid()).toBe(true);
        });

        it('has required integrations array', () => {
            expect(templateModule.Definition.integrations).toBeDefined();
            expect(Array.isArray(templateModule.Definition.integrations)).toBe(true);
        });

        it('has valid user configuration', () => {
            const userConfig = templateModule.Definition.user;
            expect(userConfig).toBeDefined();
            expect(typeof userConfig.usePassword).toBe('boolean');
            expect(['individual', 'organization']).toContain(userConfig.primary);
        });

        it('has valid database configuration', () => {
            const dbConfig = templateModule.Definition.database;
            expect(dbConfig).toBeDefined();
            // Should have at least one database type configured
            expect(dbConfig.postgres || dbConfig.mongoDB || dbConfig.documentDB).toBeDefined();
        });

        it('has valid vpc configuration', () => {
            const vpcConfig = templateModule.Definition.vpc;
            expect(vpcConfig).toBeDefined();
            expect(typeof vpcConfig.enable).toBe('boolean');
        });

        it('has valid encryption configuration', () => {
            const encConfig = templateModule.Definition.encryption;
            expect(encConfig).toBeDefined();
            expect(['kms', 'aes', 'none']).toContain(encConfig.fieldLevelEncryptionMethod);
        });
    });

    describe('ExampleIntegration template', () => {
        const templatePath = path.join(TEMPLATES_DIR, 'backend/src/integrations/ExampleIntegration.js');
        let ExampleIntegration;

        beforeAll(() => {
            // Mock @friggframework/core since it may not be installed in CLI package
            jest.mock('@friggframework/core', () => ({
                Integration: class Integration {
                    static Config = {};
                }
            }), { virtual: true });

            delete require.cache[require.resolve(templatePath)];
            ExampleIntegration = require(templatePath);
        });

        afterAll(() => {
            jest.unmock('@friggframework/core');
        });

        it('is a class/function', () => {
            expect(typeof ExampleIntegration).toBe('function');
        });

        it('has static Definition property', () => {
            expect(ExampleIntegration.Definition).toBeDefined();
        });

        it('Definition has required properties', () => {
            const definition = ExampleIntegration.Definition;
            expect(definition.name).toBeDefined();
            expect(definition.version).toBeDefined();
        });

        it('Definition matches pattern used in core integrations', () => {
            // ExampleIntegration uses static Definition (not Config)
            // to match the pattern expected by IntegrationClassValidator
            expect(ExampleIntegration.Definition).toBeDefined();
            expect(typeof ExampleIntegration.Definition.name).toBe('string');
            expect(typeof ExampleIntegration.Definition.version).toBe('string');
        });
    });

    describe('Template schema compliance', () => {
        it('template app definition does not use unknown properties', () => {
            const templatePath = path.join(TEMPLATES_DIR, 'backend/index.js');
            delete require.cache[require.resolve(templatePath)];
            const { Definition } = require(templatePath);

            const result = appDefinitionValidator.validate(Definition);
            const errors = result.getErrors();

            // Check for "additional property" errors which indicate unknown fields
            const additionalPropErrors = errors.filter(e =>
                e.message.includes('additional properties') ||
                e.code === 'ADDITIONALPROPERTIES'
            );

            if (additionalPropErrors.length > 0) {
                console.log('Unknown properties in template:',
                    additionalPropErrors.map(e => e.message));
            }

            // For now, document what additional properties exist
            // These may need to be added to the schema or removed from template
            expect(additionalPropErrors).toEqual([]);
        });
    });
});
