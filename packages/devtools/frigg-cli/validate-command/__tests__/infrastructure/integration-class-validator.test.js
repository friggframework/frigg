const { IntegrationClassValidator } = require('../../infrastructure/validators/integration-class-validator');

describe('IntegrationClassValidator', () => {
    let validator;

    beforeEach(() => {
        validator = new IntegrationClassValidator();
    });

    describe('valid integration classes', () => {
        it('validates class with Definition static property', () => {
            class ValidIntegration {
                static Definition = {
                    name: 'test-integration',
                    version: '1.0.0',
                    modules: {}
                };
            }
            const result = validator.validate(ValidIntegration, 0);
            expect(result.isValid()).toBe(true);
        });

        it('validates class with modules configuration', () => {
            class ValidIntegration {
                static Definition = {
                    name: 'oauth-integration',
                    version: '1.0.0',
                    modules: {
                        hubspot: {
                            definition: { name: 'hubspot' },
                            options: {}
                        }
                    }
                };
            }
            const result = validator.validate(ValidIntegration, 0);
            expect(result.isValid()).toBe(true);
        });
    });

    describe('invalid integration classes', () => {
        it('errors when not a function/class', () => {
            const notAClass = { Definition: { name: 'test' } };
            const result = validator.validate(notAClass, 0);
            expect(result.isValid()).toBe(false);
            expect(result.getErrors()[0].message).toContain('class');
        });

        it('errors when Definition is missing', () => {
            class NoDefinition {}
            const result = validator.validate(NoDefinition, 0);
            expect(result.isValid()).toBe(false);
            expect(result.getErrors()[0].path).toBe('integrations[0].Definition');
        });

        it('errors when Definition.name is missing', () => {
            class MissingName {
                static Definition = { version: '1.0.0' };
            }
            const result = validator.validate(MissingName, 0);
            expect(result.isValid()).toBe(false);
            expect(result.getErrors()[0].path).toBe('integrations[0].Definition.name');
        });

        it('errors when Definition.name is not a string', () => {
            class BadName {
                static Definition = { name: 123, version: '1.0.0' };
            }
            const result = validator.validate(BadName, 0);
            expect(result.isValid()).toBe(false);
            expect(result.getErrors()[0].path).toBe('integrations[0].Definition.name');
        });
    });

    describe('modules validation', () => {
        it('errors when module lacks definition', () => {
            class BadModule {
                static Definition = {
                    name: 'test',
                    modules: {
                        hubspot: { options: {} }
                    }
                };
            }
            const result = validator.validate(BadModule, 0);
            expect(result.isValid()).toBe(false);
            expect(result.getErrors()[0].path).toBe('integrations[0].Definition.modules.hubspot.definition');
        });

        it('warns when module definition lacks name', () => {
            class ModuleNoName {
                static Definition = {
                    name: 'test',
                    modules: {
                        hubspot: {
                            definition: {},
                            options: {}
                        }
                    }
                };
            }
            const result = validator.validate(ModuleNoName, 0);
            expect(result.getWarnings().length).toBeGreaterThan(0);
        });
    });

    describe('lifecycle methods', () => {
        it('warns when onCreate is not implemented', () => {
            class NoOnCreate {
                static Definition = { name: 'test', version: '1.0.0' };
            }
            const result = validator.validate(NoOnCreate, 0);
            expect(result.getWarnings().some(w => w.message.includes('onCreate'))).toBe(true);
        });

        it('passes when onCreate is implemented', () => {
            class WithOnCreate {
                static Definition = { name: 'test', version: '1.0.0' };
                async onCreate() {}
            }
            const result = validator.validate(WithOnCreate, 0);
            expect(result.getWarnings().filter(w => w.message.includes('onCreate'))).toHaveLength(0);
        });

        it('warns when getConfigOptions is not implemented', () => {
            class NoConfigOptions {
                static Definition = { name: 'test', version: '1.0.0' };
            }
            const result = validator.validate(NoConfigOptions, 0);
            expect(result.getWarnings().some(w => w.message.includes('getConfigOptions'))).toBe(true);
        });
    });

    describe('index parameter', () => {
        it('includes correct index in error paths', () => {
            class Invalid {}
            const result = validator.validate(Invalid, 5);
            expect(result.getErrors()[0].path).toContain('integrations[5]');
        });
    });
});
