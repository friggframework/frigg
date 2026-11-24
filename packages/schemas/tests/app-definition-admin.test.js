const { validateAppDefinition } = require('../index');

const baseDefinition = {
    name: 'test-app',
    provider: 'aws',
    integrations: [],
};

const validate = (extra) => validateAppDefinition({ ...baseDefinition, ...extra });

class ExampleScript {
    static Definition = { name: 'example-script' };
}

describe('app-definition schema: admin scripts and reports', () => {
    it('accepts admin script classes', () => {
        expect(validate({ adminScripts: [ExampleScript] }).valid).toBe(true);
    });

    it('accepts report classes', () => {
        expect(validate({ reports: [ExampleScript] }).valid).toBe(true);
    });

    it('rejects adminScripts and reports that are not arrays', () => {
        expect(validate({ adminScripts: ExampleScript }).valid).toBe(false);
        expect(validate({ reports: {} }).valid).toBe(false);
    });

    it('accepts the admin options the AdminScriptBuilder reads', () => {
        expect(
            validate({ admin: { enableScheduling: true, includeBuiltinReports: false } }).valid
        ).toBe(true);
    });

    it('rejects unknown or mistyped admin options', () => {
        expect(validate({ admin: { scheduling: true } }).valid).toBe(false);
        expect(validate({ admin: { enableScheduling: 'yes' } }).valid).toBe(false);
    });
});
