const { ValidationResult } = require('../../domain/entities/validation-result');
const { ValidationError } = require('../../domain/value-objects/validation-error');
const { FixSuggestion } = require('../../domain/value-objects/fix-suggestion');

describe('ValidationResult', () => {
    describe('creation', () => {
        it('creates empty result with no errors', () => {
            const result = ValidationResult.create();
            expect(result.isValid()).toBe(true);
            expect(result.getErrors()).toHaveLength(0);
            expect(result.getWarnings()).toHaveLength(0);
        });

        it('creates result with errors', () => {
            const error = ValidationError.create({
                path: 'integrations[0].name',
                message: 'Integration name is required',
                severity: 'error'
            });
            const result = ValidationResult.create({ errors: [error] });
            expect(result.isValid()).toBe(false);
            expect(result.getErrors()).toHaveLength(1);
        });

        it('creates result with warnings', () => {
            const warning = ValidationError.create({
                path: 'config.timeout',
                message: 'Timeout value is unusually high',
                severity: 'warning'
            });
            const result = ValidationResult.create({ errors: [warning] });
            expect(result.isValid()).toBe(true);
            expect(result.getWarnings()).toHaveLength(1);
        });
    });

    describe('addError', () => {
        it('adds error to result', () => {
            const result = ValidationResult.create();
            const error = ValidationError.create({
                path: 'name',
                message: 'Name is required',
                severity: 'error'
            });
            result.addError(error);
            expect(result.isValid()).toBe(false);
            expect(result.getErrors()).toContain(error);
        });

        it('adds warning without affecting validity', () => {
            const result = ValidationResult.create();
            const warning = ValidationError.create({
                path: 'description',
                message: 'Description is recommended',
                severity: 'warning'
            });
            result.addError(warning);
            expect(result.isValid()).toBe(true);
            expect(result.getWarnings()).toContain(warning);
        });
    });

    describe('merge', () => {
        it('merges two valid results', () => {
            const result1 = ValidationResult.create();
            const result2 = ValidationResult.create();
            const merged = result1.merge(result2);
            expect(merged.isValid()).toBe(true);
        });

        it('merges results with errors', () => {
            const error1 = ValidationError.create({
                path: 'name',
                message: 'Name required',
                severity: 'error'
            });
            const error2 = ValidationError.create({
                path: 'version',
                message: 'Version required',
                severity: 'error'
            });
            const result1 = ValidationResult.create({ errors: [error1] });
            const result2 = ValidationResult.create({ errors: [error2] });
            const merged = result1.merge(result2);
            expect(merged.isValid()).toBe(false);
            expect(merged.getErrors()).toHaveLength(2);
        });

        it('preserves context from both results', () => {
            const result1 = ValidationResult.create({ context: { file: 'index.js' } });
            const result2 = ValidationResult.create({ context: { integration: 'oauth' } });
            const merged = result1.merge(result2);
            expect(merged.getContext()).toMatchObject({ file: 'index.js', integration: 'oauth' });
        });
    });

    describe('filtering', () => {
        it('filters errors by path prefix', () => {
            const errors = [
                ValidationError.create({ path: 'integrations[0].name', message: 'a', severity: 'error' }),
                ValidationError.create({ path: 'integrations[1].config', message: 'b', severity: 'error' }),
                ValidationError.create({ path: 'database.uri', message: 'c', severity: 'error' })
            ];
            const result = ValidationResult.create({ errors });
            const filtered = result.filterByPath('integrations');
            expect(filtered.getErrors()).toHaveLength(2);
        });

        it('filters by severity', () => {
            const errors = [
                ValidationError.create({ path: 'a', message: 'error1', severity: 'error' }),
                ValidationError.create({ path: 'b', message: 'warning1', severity: 'warning' }),
                ValidationError.create({ path: 'c', message: 'info1', severity: 'info' })
            ];
            const result = ValidationResult.create({ errors });
            expect(result.getBySeverity('error')).toHaveLength(1);
            expect(result.getBySeverity('warning')).toHaveLength(1);
            expect(result.getBySeverity('info')).toHaveLength(1);
        });
    });

    describe('summary', () => {
        it('generates summary statistics', () => {
            const errors = [
                ValidationError.create({ path: 'a', message: 'm1', severity: 'error' }),
                ValidationError.create({ path: 'b', message: 'm2', severity: 'error' }),
                ValidationError.create({ path: 'c', message: 'm3', severity: 'warning' })
            ];
            const result = ValidationResult.create({ errors });
            const summary = result.getSummary();
            expect(summary.errorCount).toBe(2);
            expect(summary.warningCount).toBe(1);
            expect(summary.isValid).toBe(false);
        });
    });

    describe('serialization', () => {
        it('converts to JSON', () => {
            const error = ValidationError.create({
                path: 'name',
                message: 'Required',
                severity: 'error',
                fix: FixSuggestion.create({ action: 'add', description: 'Add name field' })
            });
            const result = ValidationResult.create({ errors: [error] });
            const json = result.toJSON();
            expect(json).toHaveProperty('valid', false);
            expect(json).toHaveProperty('errors');
            expect(json.errors[0]).toHaveProperty('path', 'name');
        });
    });
});
