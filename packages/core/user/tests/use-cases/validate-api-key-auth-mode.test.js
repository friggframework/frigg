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

    // ---- (4a) empty allowlist ---------------------------------------------
    it('throws on modules: [] with no module (empty allowlist)', () => {
        expect(() =>
            validateApiKeyAuthMode(
                { authModes: { apiKey: { modules: [] } } },
                modules
            )
        ).toThrow(/names no identity module/);
    });

    it('accepts modules: [] WITH a module fallback (union semantics)', () => {
        expect(() =>
            validateApiKeyAuthMode(
                { authModes: { apiKey: { modules: [], module: 'reevo' } } },
                modules
            )
        ).not.toThrow();
    });

    // ---- (4b) allowedOrigins must be an array -----------------------------
    it('throws when allowedOrigins is a bare string, not an array', () => {
        expect(() =>
            validateApiKeyAuthMode(
                {
                    authModes: {
                        apiKey: {
                            module: 'reevo',
                            allowedOrigins: 'https://app.example.com',
                        },
                    },
                },
                modules
            )
        ).toThrow(/allowedOrigins must be an array/);
    });

    it('accepts an array allowedOrigins', () => {
        expect(() =>
            validateApiKeyAuthMode(
                {
                    authModes: {
                        apiKey: {
                            module: 'reevo',
                            allowedOrigins: ['https://app.example.com'],
                        },
                    },
                },
                modules
            )
        ).not.toThrow();
    });

    // ---- (4c) rateLimit numeric fields must be positive finite ------------
    it.each([
        ['maxPerKey', 0],
        ['maxPerKey', -5],
        ['maxGlobal', 0],
        ['windowMs', -1],
        ['windowMs', NaN],
        ['maxGlobal', Infinity],
    ])('throws when rateLimit.%s is %p', (field, value) => {
        expect(() =>
            validateApiKeyAuthMode(
                {
                    authModes: {
                        apiKey: {
                            module: 'reevo',
                            rateLimit: { [field]: value },
                        },
                    },
                },
                modules
            )
        ).toThrow(
            new RegExp(`rateLimit\\.${field} must be a positive finite number`)
        );
    });

    it('accepts positive finite rateLimit values', () => {
        expect(() =>
            validateApiKeyAuthMode(
                {
                    authModes: {
                        apiKey: {
                            module: 'reevo',
                            rateLimit: {
                                maxPerKey: 10,
                                maxGlobal: 1000,
                                windowMs: 60000,
                            },
                        },
                    },
                },
                modules
            )
        ).not.toThrow();
    });

    it('throws when rateLimit is not an object', () => {
        expect(() =>
            validateApiKeyAuthMode(
                {
                    authModes: {
                        apiKey: { module: 'reevo', rateLimit: 'fast' },
                    },
                },
                modules
            )
        ).toThrow(/rateLimit must be an object/);
    });
});
