const {
    validateApiKeyAuthMode,
} = require('../../use-cases/validate-api-key-auth-mode');

const modules = [{ moduleName: 'reevo' }, { moduleName: 'acme' }];

describe('validateApiKeyAuthMode', () => {
    it('is a no-op when apiKey mode is not configured (default-off)', () => {
        expect(() => validateApiKeyAuthMode({}, modules)).not.toThrow();
        expect(() => validateApiKeyAuthMode(null, modules)).not.toThrow();
        expect(() =>
            validateApiKeyAuthMode({ authModes: { friggToken: true } }, modules)
        ).not.toThrow();
    });

    it('passes when the single configured module exists', () => {
        expect(() =>
            validateApiKeyAuthMode(
                { authModes: { apiKey: { module: 'reevo' } } },
                modules
            )
        ).not.toThrow();
    });

    it('passes when every module in a modules allowlist exists', () => {
        expect(() =>
            validateApiKeyAuthMode(
                { authModes: { apiKey: { modules: ['reevo', 'acme'] } } },
                modules
            )
        ).not.toThrow();
    });

    it('throws when apiKey mode is enabled but names no module', () => {
        expect(() =>
            validateApiKeyAuthMode({ authModes: { apiKey: {} } }, modules)
        ).toThrow(/names no identity module/);
    });

    it('throws when the configured module is not registered', () => {
        expect(() =>
            validateApiKeyAuthMode(
                { authModes: { apiKey: { module: 'ghost' } } },
                modules
            )
        ).toThrow(/'ghost' is not a registered module/);
    });

    it('throws when any allowlisted module is missing', () => {
        expect(() =>
            validateApiKeyAuthMode(
                { authModes: { apiKey: { modules: ['reevo', 'ghost'] } } },
                modules
            )
        ).toThrow(/'ghost' is not a registered module/);
    });
});
