const { ValidationError } = require('../../domain/value-objects/validation-error');
const { FixSuggestion } = require('../../domain/value-objects/fix-suggestion');

describe('ValidationError', () => {
    describe('creation', () => {
        it('creates error with required fields', () => {
            const error = ValidationError.create({
                path: 'integrations[0].name',
                message: 'Integration name is required'
            });
            expect(error.path).toBe('integrations[0].name');
            expect(error.message).toBe('Integration name is required');
            expect(error.severity).toBe('error');
        });

        it('creates error with custom severity', () => {
            const warning = ValidationError.create({
                path: 'config.timeout',
                message: 'Timeout value seems high',
                severity: 'warning'
            });
            expect(warning.severity).toBe('warning');
            expect(warning.isWarning()).toBe(true);
            expect(warning.isError()).toBe(false);
        });

        it('creates error with fix suggestion', () => {
            const fix = FixSuggestion.create({
                action: 'add',
                description: 'Add the name field to integration'
            });
            const error = ValidationError.create({
                path: 'integrations[0].name',
                message: 'Required field missing',
                fix
            });
            expect(error.fix).toBe(fix);
            expect(error.hasFix()).toBe(true);
        });

        it('throws for missing path', () => {
            expect(() => ValidationError.create({ message: 'error' }))
                .toThrow('path is required');
        });

        it('throws for missing message', () => {
            expect(() => ValidationError.create({ path: 'a.b' }))
                .toThrow('message is required');
        });

        it('throws for invalid severity', () => {
            expect(() => ValidationError.create({
                path: 'a',
                message: 'b',
                severity: 'critical'
            })).toThrow('Invalid severity');
        });
    });

    describe('path parsing', () => {
        it('parses simple path', () => {
            const error = ValidationError.create({ path: 'name', message: 'm' });
            expect(error.getPathSegments()).toEqual(['name']);
        });

        it('parses nested path', () => {
            const error = ValidationError.create({ path: 'config.database.uri', message: 'm' });
            expect(error.getPathSegments()).toEqual(['config', 'database', 'uri']);
        });

        it('parses array path', () => {
            const error = ValidationError.create({ path: 'integrations[0].modules[1].name', message: 'm' });
            expect(error.getPathSegments()).toEqual(['integrations', '0', 'modules', '1', 'name']);
        });

        it('gets root path', () => {
            const error = ValidationError.create({ path: 'integrations[0].config.timeout', message: 'm' });
            expect(error.getRootPath()).toBe('integrations');
        });
    });

    describe('severity helpers', () => {
        it('identifies error severity', () => {
            const error = ValidationError.create({ path: 'a', message: 'm', severity: 'error' });
            expect(error.isError()).toBe(true);
            expect(error.isWarning()).toBe(false);
            expect(error.isInfo()).toBe(false);
        });

        it('identifies warning severity', () => {
            const error = ValidationError.create({ path: 'a', message: 'm', severity: 'warning' });
            expect(error.isError()).toBe(false);
            expect(error.isWarning()).toBe(true);
        });

        it('identifies info severity', () => {
            const error = ValidationError.create({ path: 'a', message: 'm', severity: 'info' });
            expect(error.isError()).toBe(false);
            expect(error.isInfo()).toBe(true);
        });
    });

    describe('code', () => {
        it('assigns error code', () => {
            const error = ValidationError.create({
                path: 'name',
                message: 'Required',
                code: 'REQUIRED_FIELD'
            });
            expect(error.code).toBe('REQUIRED_FIELD');
        });

        it('defaults to null code', () => {
            const error = ValidationError.create({ path: 'a', message: 'm' });
            expect(error.code).toBeNull();
        });
    });

    describe('serialization', () => {
        it('converts to JSON', () => {
            const error = ValidationError.create({
                path: 'config.name',
                message: 'Name required',
                severity: 'error',
                code: 'REQUIRED'
            });
            const json = error.toJSON();
            expect(json).toEqual({
                path: 'config.name',
                message: 'Name required',
                severity: 'error',
                code: 'REQUIRED',
                fix: null
            });
        });

        it('includes fix in JSON', () => {
            const fix = FixSuggestion.create({ action: 'add', description: 'Add field' });
            const error = ValidationError.create({
                path: 'a',
                message: 'm',
                fix
            });
            const json = error.toJSON();
            expect(json.fix).toMatchObject({ action: 'add', description: 'Add field' });
        });
    });

    describe('equality', () => {
        it('considers errors equal by path and message', () => {
            const error1 = ValidationError.create({ path: 'a.b', message: 'Required' });
            const error2 = ValidationError.create({ path: 'a.b', message: 'Required' });
            expect(error1.equals(error2)).toBe(true);
        });

        it('considers errors different by path', () => {
            const error1 = ValidationError.create({ path: 'a.b', message: 'Required' });
            const error2 = ValidationError.create({ path: 'a.c', message: 'Required' });
            expect(error1.equals(error2)).toBe(false);
        });
    });
});
