const {
    applyAppDefinitionDefaults,
    toAppDefinitionSchemaView,
    validateAppDefinition,
    getSchema,
} = require('../index');

class FakeIntegration {
    static Definition = {
        name: 'fake',
        version: '1.0.0',
        modules: {},
    };
}

describe('toAppDefinitionSchemaView', () => {
    test('replaces integration classes with their static Definition', () => {
        const view = toAppDefinitionSchemaView({
            integrations: [FakeIntegration],
        });

        expect(view.integrations).toEqual([
            { Definition: FakeIntegration.Definition },
        ]);
    });

    test('leaves plain integration objects as they are', () => {
        const plain = { Definition: { name: 'plain' } };

        expect(
            toAppDefinitionSchemaView({ integrations: [plain] }).integrations
        ).toEqual([plain]);
    });

    test('maps admin script and report classes the same way', () => {
        class Script {
            static Definition = { name: 'script' };
        }
        const view = toAppDefinitionSchemaView({
            adminScripts: [Script],
            reports: [Script],
        });

        expect(view.adminScripts).toEqual([{ Definition: { name: 'script' } }]);
        expect(view.reports).toEqual([{ Definition: { name: 'script' } }]);
    });

    test('does not mutate the definition', () => {
        const definition = { integrations: [FakeIntegration] };
        toAppDefinitionSchemaView(definition);

        expect(definition.integrations[0]).toBe(FakeIntegration);
    });
});

describe('validateAppDefinition with integration classes', () => {
    test('accepts an app that lists integration classes', () => {
        const result = validateAppDefinition({
            integrations: [FakeIntegration],
        });

        expect(result.errors).toBe(null);
        expect(result.valid).toBe(true);
    });

    test('rejects an integration entry that is not a class or object', () => {
        const result = validateAppDefinition({ integrations: ['hubspot'] });

        expect(result.valid).toBe(false);
        expect(result.errors[0].instancePath).toBe('/integrations/0');
    });

    test('rejects a class without a static Definition', () => {
        class NoDefinition {}
        const result = validateAppDefinition({ integrations: [NoDefinition] });

        expect(result.valid).toBe(false);
    });

    test('returns the original definition as data', () => {
        const definition = { integrations: [FakeIntegration] };

        expect(validateAppDefinition(definition).data).toBe(definition);
    });
});

describe('applyAppDefinitionDefaults', () => {
    test('fills the user defaults that core reads, so login works', () => {
        const result = applyAppDefinitionDefaults({
            integrations: [],
            user: { usePassword: true },
        });

        expect(result.user).toEqual({
            usePassword: true,
            primary: 'individual',
            individualUserRequired: true,
            organizationUserRequired: false,
            strictUserValidation: false,
        });
    });

    test('gives an app without a user block a working user config', () => {
        const result = applyAppDefinitionDefaults({ integrations: [] });

        expect(result.user).toEqual({
            usePassword: false,
            primary: 'individual',
            individualUserRequired: true,
            organizationUserRequired: false,
            strictUserValidation: false,
        });
    });

    test('honours the deprecated user.password alias of usePassword', () => {
        expect(
            applyAppDefinitionDefaults({ user: { password: true } }).user
                .usePassword
        ).toBe(true);
        expect(
            applyAppDefinitionDefaults({
                user: { password: true, usePassword: false },
            }).user.usePassword
        ).toBe(false);
    });

    test('keeps the shared secret enabled when authModes leaves it out, as core does', () => {
        const result = applyAppDefinitionDefaults({
            user: { authModes: { friggToken: true } },
        });

        expect(result.user.authModes).toEqual({
            friggToken: true,
            sharedSecret: true,
            adopterJwt: false,
        });
    });

    test('keeps values the app sets', () => {
        const result = applyAppDefinitionDefaults({
            integrations: [],
            user: {
                individualUserRequired: false,
                organizationUserRequired: true,
            },
        });

        expect(result.user.individualUserRequired).toBe(false);
        expect(result.user.organizationUserRequired).toBe(true);
    });

    test('does not create blocks the app leaves out', () => {
        const result = applyAppDefinitionDefaults({ integrations: [] });

        expect(result.vpc).toBeUndefined();
        expect(result.encryption).toBeUndefined();
        expect(result.database).toBeUndefined();
    });

    test('does not invent an encryption method', () => {
        const result = applyAppDefinitionDefaults({
            integrations: [],
            encryption: {},
        });

        expect(result.encryption.fieldLevelEncryptionMethod).toBeUndefined();
    });

    test('keeps class references and does not mutate the input', () => {
        const definition = { integrations: [FakeIntegration], user: {} };
        const result = applyAppDefinitionDefaults(definition);

        expect(result).not.toBe(definition);
        expect(result.integrations[0]).toBe(FakeIntegration);
        expect(definition.user).toEqual({});
    });

    test('is idempotent', () => {
        const once = applyAppDefinitionDefaults({ integrations: [], user: {} });
        const twice = applyAppDefinitionDefaults(once);

        expect(twice).toEqual(once);
    });

    test('tolerates a missing or non-object definition', () => {
        expect(applyAppDefinitionDefaults(undefined)).toBeUndefined();
        expect(applyAppDefinitionDefaults(null)).toBeNull();
    });

    test('does not copy array defaults by reference', () => {
        const a = applyAppDefinitionDefaults({ integrations: [] });
        const b = applyAppDefinitionDefaults({});

        expect(Array.isArray(b.integrations)).toBe(true);
        b.integrations.push('x');
        expect(
            getSchema('app-definition').properties.integrations.default
        ).toEqual([]);
        expect(a.integrations).toEqual([]);
    });
});
