const {
    resolveProvider,
    determineProviderName,
    providerPackageName,
    KNOWN_PROVIDERS,
} = require('./resolve-provider');

describe('Provider Resolver', () => {
    describe('determineProviderName', () => {
        const originalEnv = process.env.FRIGG_PROVIDER;

        afterEach(() => {
            if (originalEnv === undefined) {
                delete process.env.FRIGG_PROVIDER;
            } else {
                process.env.FRIGG_PROVIDER = originalEnv;
            }
        });

        it('uses explicit providerName when given', () => {
            expect(
                determineProviderName({ provider: 'aws' }, 'netlify')
            ).toBe('netlify');
        });

        it('falls back to appDefinition.provider', () => {
            expect(
                determineProviderName({ provider: 'netlify' })
            ).toBe('netlify');
        });

        it('falls back to FRIGG_PROVIDER env var', () => {
            process.env.FRIGG_PROVIDER = 'netlify';
            expect(determineProviderName({})).toBe('netlify');
        });

        it('defaults to aws', () => {
            delete process.env.FRIGG_PROVIDER;
            expect(determineProviderName()).toBe('aws');
            expect(determineProviderName({})).toBe('aws');
            expect(determineProviderName(null)).toBe('aws');
        });

        it('respects priority: explicit > appDef > env > default', () => {
            process.env.FRIGG_PROVIDER = 'from-env';
            expect(
                determineProviderName({ provider: 'from-appdef' }, 'explicit')
            ).toBe('explicit');
            expect(
                determineProviderName({ provider: 'from-appdef' })
            ).toBe('from-appdef');
            expect(determineProviderName({})).toBe('from-env');
        });
    });

    describe('providerPackageName', () => {
        it('maps provider name to @friggframework/provider-{name}', () => {
            expect(providerPackageName('aws')).toBe(
                '@friggframework/provider-aws'
            );
            expect(providerPackageName('netlify')).toBe(
                '@friggframework/provider-netlify'
            );
        });
    });

    describe('KNOWN_PROVIDERS', () => {
        it('includes aws and netlify', () => {
            expect(KNOWN_PROVIDERS).toContain('aws');
            expect(KNOWN_PROVIDERS).toContain('netlify');
        });
    });

    describe('resolveProvider', () => {
        it('resolves installed known provider', () => {
            // 'aws' provider package is installed in the monorepo
            const provider = resolveProvider({ provider: 'aws' });
            expect(provider).toBeDefined();
            expect(provider.name).toBe('aws');
        });

        it('throws with different hint for unknown provider', () => {
            expect(() =>
                resolveProvider({ provider: 'vercel' })
            ).toThrow(/Is 'vercel' a valid Frigg provider/);
        });

        it('loads a provider that returns the plugin interface', () => {
            // Mock require to simulate an installed provider
            const mockProvider = {
                name: 'netlify',
                deploy: jest.fn(),
                createHandler: jest.fn(),
                validate: jest.fn(),
                detect: jest.fn(),
            };

            jest.mock(
                '@friggframework/provider-netlify',
                () => mockProvider,
                { virtual: true }
            );

            const provider = resolveProvider({ provider: 'netlify' });
            expect(provider.name).toBe('netlify');
            expect(typeof provider.deploy).toBe('function');
            expect(typeof provider.createHandler).toBe('function');

            jest.restoreAllMocks();
        });

        it('accepts explicit provider option override', () => {
            const mockProvider = { name: 'netlify' };
            jest.mock(
                '@friggframework/provider-netlify',
                () => mockProvider,
                { virtual: true }
            );

            // appDefinition says 'aws', but explicit option says 'netlify'
            const provider = resolveProvider(
                { provider: 'aws' },
                { provider: 'netlify' }
            );
            expect(provider.name).toBe('netlify');

            jest.restoreAllMocks();
        });
    });
});
