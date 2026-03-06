const { loadAppDefinition, setAppDefinition } = require('./app-definition-loader');

describe('app-definition-loader', () => {
    afterEach(() => {
        // Clear the cached definition between tests
        setAppDefinition(null);
    });

    describe('setAppDefinition', () => {
        test('caches the definition so loadAppDefinition skips discovery', () => {
            const mockDefinition = {
                name: 'test-app',
                integrations: [{ Definition: { name: 'hubspot' } }],
                user: { primary: 'individual' },
            };

            setAppDefinition(mockDefinition);

            const result = loadAppDefinition();

            expect(result.appDefinition).toBe(mockDefinition);
            expect(result.integrations).toEqual(mockDefinition.integrations);
            expect(result.userConfig).toEqual(mockDefinition.user);
        });

        test('returns empty integrations when definition has none', () => {
            setAppDefinition({ name: 'minimal-app' });

            const result = loadAppDefinition();

            expect(result.integrations).toEqual([]);
            expect(result.userConfig).toBeNull();
        });

        test('can be cleared by passing null', () => {
            setAppDefinition({ name: 'test' });
            setAppDefinition(null);

            // Without a cached definition and no backend dir, loadAppDefinition
            // falls through to discovery which will throw in test environment
            expect(() => loadAppDefinition()).toThrow();
        });
    });
});
