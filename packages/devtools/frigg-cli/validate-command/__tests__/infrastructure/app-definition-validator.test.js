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

        it('validates definition with integration classes', () => {
            const MockIntegration = class {
                static Definition = { name: 'test-integration' };
            };
            const definition = {
                integrations: [MockIntegration]
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
            expect(result.getErrors().some(e => e.path === 'integrations')).toBe(true);
        });

        it('errors when integration lacks Definition property', () => {
            const BadIntegration = class {};
            const definition = { integrations: [BadIntegration] };
            const result = validator.validate(definition);
            expect(result.isValid()).toBe(false);
            expect(result.getErrors()[0].path).toBe('integrations[0]');
            expect(result.getErrors()[0].message).toContain('Definition');
        });

        it('errors when integration Definition lacks name', () => {
            const BadIntegration = class {
                static Definition = {};
            };
            const definition = { integrations: [BadIntegration] };
            const result = validator.validate(definition);
            expect(result.isValid()).toBe(false);
            expect(result.getErrors()[0].path).toBe('integrations[0].Definition.name');
        });

        it('warns on duplicate integration names', () => {
            const Int1 = class { static Definition = { name: 'same-name' }; };
            const Int2 = class { static Definition = { name: 'same-name' }; };
            const definition = { integrations: [Int1, Int2] };
            const result = validator.validate(definition);
            expect(result.getWarnings().some(w => w.message.includes('duplicate'))).toBe(true);
        });
    });

    describe('database validation', () => {
        it('warns when no database configured', () => {
            const definition = { integrations: [] };
            const result = validator.validate(definition);
            expect(result.getWarnings().some(w => w.path === 'database')).toBe(true);
        });

        it('errors on invalid database type', () => {
            const definition = {
                integrations: [],
                database: { mysql: { enable: true } }
            };
            const result = validator.validate(definition);
            expect(result.isValid()).toBe(false);
            expect(result.getErrors()[0].path).toBe('database');
        });

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
    });

    describe('user configuration', () => {
        it('validates mongoose user model', () => {
            const definition = {
                integrations: [],
                user: { model: 'mongoose' }
            };
            const result = validator.validate(definition);
            const userErrors = result.getErrors().filter(e => e.path.startsWith('user'));
            expect(userErrors).toHaveLength(0);
        });

        it('validates prisma user model', () => {
            const definition = {
                integrations: [],
                user: { model: 'prisma' }
            };
            const result = validator.validate(definition);
            const userErrors = result.getErrors().filter(e => e.path.startsWith('user'));
            expect(userErrors).toHaveLength(0);
        });

        it('errors on invalid user model', () => {
            const definition = {
                integrations: [],
                user: { model: 'invalid' }
            };
            const result = validator.validate(definition);
            expect(result.getErrors().some(e => e.path === 'user.model')).toBe(true);
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
