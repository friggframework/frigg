const { AppDefinitionValidator } = require('../../infrastructure/validators/app-definition-validator');
const { ValidationResult } = require('../../domain/entities/validation-result');

describe('AppDefinitionValidator', () => {
    let validator;

    beforeEach(() => {
        validator = new AppDefinitionValidator();
    });

    describe('valid definitions', () => {
        it('validates minimal valid definition', () => {
            const definition = {
                integrations: []
            };
            const result = validator.validate(definition);
            expect(result.isValid()).toBe(true);
        });

        it('validates definition with database config', () => {
            const definition = {
                integrations: [],
                database: { mongoDB: { enable: true } }
            };
            const result = validator.validate(definition);
            expect(result.isValid()).toBe(true);
        });

        it('validates definition with integration objects', () => {
            const definition = {
                integrations: [{ Definition: { name: 'test-integration' } }]
            };
            const result = validator.validate(definition);
            expect(result.isValid()).toBe(true);
        });
    });

    describe('integrations validation', () => {
        it('errors when integrations is not an array', () => {
            const definition = { integrations: 'not-an-array' };
            const result = validator.validate(definition);
            expect(result.isValid()).toBe(false);
            expect(result.getErrors()[0].path).toBe('integrations');
        });

        it('errors when integrations is missing', () => {
            const definition = {};
            const result = validator.validate(definition);
            expect(result.isValid()).toBe(false);
            expect(result.getErrors().some(e => e.message.includes('integrations'))).toBe(true);
        });

        it('errors when integration lacks Definition property', () => {
            const BadIntegration = class {};
            const definition = { integrations: [BadIntegration] };
            const result = validator.validate(definition);
            expect(result.isValid()).toBe(false);
            expect(result.getErrors().some(e => e.path === 'integrations[0]' && e.message.includes('Definition'))).toBe(true);
        });

        it('errors when integration Definition lacks name', () => {
            const BadIntegration = class {
                static Definition = {};
            };
            const definition = { integrations: [BadIntegration] };
            const result = validator.validate(definition);
            expect(result.isValid()).toBe(false);
            expect(result.getErrors().some(e => e.path.includes('integrations[0]') && e.message.includes('name'))).toBe(true);
        });

        it('warns on duplicate integration names', () => {
            const Int1 = class { static Definition = { name: 'same-name', version: '1.0.0' }; };
            const Int2 = class { static Definition = { name: 'same-name', version: '1.0.0' }; };
            const definition = { integrations: [Int1, Int2] };
            const result = validator.validate(definition);
            expect(result.getWarnings().some(w => w.message.includes('duplicate'))).toBe(true);
        });
    });

    describe('database validation', () => {
        it('validates mongoDB configuration', () => {
            const definition = {
                integrations: [],
                database: { mongoDB: { enable: true } }
            };
            const result = validator.validate(definition);
            const dbErrors = result.getErrors().filter(e => e.path.startsWith('database'));
            expect(dbErrors).toHaveLength(0);
        });

        it('validates postgres configuration', () => {
            const definition = {
                integrations: [],
                database: { postgres: { enable: true } }
            };
            const result = validator.validate(definition);
            const dbErrors = result.getErrors().filter(e => e.path.startsWith('database'));
            expect(dbErrors).toHaveLength(0);
        });

        it('validates documentDB configuration', () => {
            const definition = {
                integrations: [],
                database: { documentDB: { enable: true } }
            };
            const result = validator.validate(definition);
            const dbErrors = result.getErrors().filter(e => e.path.startsWith('database'));
            expect(dbErrors).toHaveLength(0);
        });
    });

    describe('user configuration', () => {
        it('validates user with password enabled', () => {
            const definition = {
                integrations: [],
                user: { usePassword: true }
            };
            const result = validator.validate(definition);
            const userErrors = result.getErrors().filter(e => e.path.startsWith('user'));
            expect(userErrors).toHaveLength(0);
        });

        it('validates user with custom model object', () => {
            const definition = {
                integrations: [],
                user: { model: { name: 'CustomUserModel' } }
            };
            const result = validator.validate(definition);
            const userErrors = result.getErrors().filter(e => e.path.startsWith('user'));
            expect(userErrors).toHaveLength(0);
        });

        it('validates user authModes configuration', () => {
            const definition = {
                integrations: [],
                user: {
                    authModes: {
                        friggToken: true,
                        sharedSecret: true
                    }
                }
            };
            const result = validator.validate(definition);
            const userErrors = result.getErrors().filter(e => e.path.startsWith('user'));
            expect(userErrors).toHaveLength(0);
        });
    });

    describe('result type', () => {
        it('returns ValidationResult instance', () => {
            const definition = { integrations: [] };
            const result = validator.validate(definition);
            expect(result).toBeInstanceOf(ValidationResult);
        });
    });
});
