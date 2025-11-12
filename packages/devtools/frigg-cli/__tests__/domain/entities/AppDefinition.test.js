const {AppDefinition} = require('../../../domain/entities/AppDefinition');
const {DomainException} = require('../../../domain/exceptions/DomainException');

describe('AppDefinition', () => {
    describe('create', () => {
        test('creates app definition with minimal props', () => {
            const appDef = AppDefinition.create({
                name: 'my-app',
                version: '1.0.0'
            });

            expect(appDef.name).toBe('my-app');
            expect(appDef.version.value).toBe('1.0.0');
            expect(appDef.integrations).toEqual([]);
            expect(appDef.apiModules).toEqual([]);
        });

        test('creates app definition with full props', () => {
            const appDef = AppDefinition.create({
                name: 'my-app',
                version: '1.0.0',
                description: 'My application',
                author: 'John Doe',
                license: 'MIT',
                repository: {url: 'https://github.com/user/repo'},
                config: {feature1: true}
            });

            expect(appDef.description).toBe('My application');
            expect(appDef.author).toBe('John Doe');
            expect(appDef.license).toBe('MIT');
            expect(appDef.repository.url).toBe('https://github.com/user/repo');
            expect(appDef.config.feature1).toBe(true);
        });
    });

    describe('registerIntegration', () => {
        test('successfully registers new integration', () => {
            const appDef = AppDefinition.create({
                name: 'my-app',
                version: '1.0.0'
            });

            appDef.registerIntegration('salesforce-sync');

            expect(appDef.hasIntegration('salesforce-sync')).toBe(true);
            expect(appDef.integrations).toHaveLength(1);
            expect(appDef.integrations[0].name).toBe('salesforce-sync');
            expect(appDef.integrations[0].enabled).toBe(true);
        });

        test('throws error when registering duplicate integration', () => {
            const appDef = AppDefinition.create({
                name: 'my-app',
                version: '1.0.0'
            });

            appDef.registerIntegration('salesforce-sync');

            expect(() => {
                appDef.registerIntegration('salesforce-sync');
            }).toThrow(DomainException);
            expect(() => {
                appDef.registerIntegration('salesforce-sync');
            }).toThrow("already registered");
        });

        test('updates updatedAt timestamp', () => {
            const appDef = AppDefinition.create({
                name: 'my-app',
                version: '1.0.0'
            });

            const beforeTime = appDef.updatedAt.getTime();
            appDef.registerIntegration('test-integration');
            const afterTime = appDef.updatedAt.getTime();

            expect(afterTime).toBeGreaterThanOrEqual(beforeTime);
        });
    });

    describe('unregisterIntegration', () => {
        test('successfully unregisters integration', () => {
            const appDef = AppDefinition.create({
                name: 'my-app',
                version: '1.0.0'
            });

            appDef.registerIntegration('salesforce-sync');
            appDef.unregisterIntegration('salesforce-sync');

            expect(appDef.hasIntegration('salesforce-sync')).toBe(false);
            expect(appDef.integrations).toHaveLength(0);
        });

        test('throws error when unregistering non-existent integration', () => {
            const appDef = AppDefinition.create({
                name: 'my-app',
                version: '1.0.0'
            });

            expect(() => {
                appDef.unregisterIntegration('non-existent');
            }).toThrow(DomainException);
            expect(() => {
                appDef.unregisterIntegration('non-existent');
            }).toThrow("not registered");
        });
    });

    describe('hasIntegration', () => {
        test('returns true for registered integration', () => {
            const appDef = AppDefinition.create({
                name: 'my-app',
                version: '1.0.0'
            });

            appDef.registerIntegration('test-integration');

            expect(appDef.hasIntegration('test-integration')).toBe(true);
        });

        test('returns false for unregistered integration', () => {
            const appDef = AppDefinition.create({
                name: 'my-app',
                version: '1.0.0'
            });

            expect(appDef.hasIntegration('non-existent')).toBe(false);
        });
    });

    describe('enableIntegration', () => {
        test('enables integration', () => {
            const appDef = AppDefinition.create({
                name: 'my-app',
                version: '1.0.0'
            });

            appDef.registerIntegration('test-integration');
            appDef.disableIntegration('test-integration');
            appDef.enableIntegration('test-integration');

            const integration = appDef.integrations.find(i => i.name === 'test-integration');
            expect(integration.enabled).toBe(true);
        });

        test('throws error for non-existent integration', () => {
            const appDef = AppDefinition.create({
                name: 'my-app',
                version: '1.0.0'
            });

            expect(() => {
                appDef.enableIntegration('non-existent');
            }).toThrow(DomainException);
        });
    });

    describe('disableIntegration', () => {
        test('disables integration', () => {
            const appDef = AppDefinition.create({
                name: 'my-app',
                version: '1.0.0'
            });

            appDef.registerIntegration('test-integration');
            appDef.disableIntegration('test-integration');

            const integration = appDef.integrations.find(i => i.name === 'test-integration');
            expect(integration.enabled).toBe(false);
        });

        test('throws error for non-existent integration', () => {
            const appDef = AppDefinition.create({
                name: 'my-app',
                version: '1.0.0'
            });

            expect(() => {
                appDef.disableIntegration('non-existent');
            }).toThrow(DomainException);
        });
    });

    describe('registerApiModule', () => {
        test('registers new API module', () => {
            const appDef = AppDefinition.create({
                name: 'my-app',
                version: '1.0.0'
            });

            appDef.registerApiModule('salesforce', '2.0.0', 'npm');

            expect(appDef.hasApiModule('salesforce')).toBe(true);
            expect(appDef.apiModules).toHaveLength(1);
            expect(appDef.apiModules[0].name).toBe('salesforce');
            expect(appDef.apiModules[0].version).toBe('2.0.0');
            expect(appDef.apiModules[0].source).toBe('npm');
        });

        test('throws error for duplicate API module', () => {
            const appDef = AppDefinition.create({
                name: 'my-app',
                version: '1.0.0'
            });

            appDef.registerApiModule('salesforce', '2.0.0');

            expect(() => {
                appDef.registerApiModule('salesforce', '3.0.0');
            }).toThrow(DomainException);
        });
    });

    describe('getEnabledIntegrations', () => {
        test('returns only enabled integrations', () => {
            const appDef = AppDefinition.create({
                name: 'my-app',
                version: '1.0.0'
            });

            appDef.registerIntegration('integration1');
            appDef.registerIntegration('integration2');
            appDef.registerIntegration('integration3');
            appDef.disableIntegration('integration2');

            const enabled = appDef.getEnabledIntegrations();

            expect(enabled).toHaveLength(2);
            expect(enabled.map(i => i.name)).toContain('integration1');
            expect(enabled.map(i => i.name)).toContain('integration3');
            expect(enabled.map(i => i.name)).not.toContain('integration2');
        });
    });

    describe('validate', () => {
        test('passes for valid app definition', () => {
            const appDef = AppDefinition.create({
                name: 'my-app',
                version: '1.0.0',
                description: 'A valid app'
            });

            const result = appDef.validate();

            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        test('fails when name is missing', () => {
            const appDef = AppDefinition.create({
                name: '',
                version: '1.0.0'
            });

            const result = appDef.validate();

            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('App name is required');
        });

        test('fails when name is too long', () => {
            const appDef = AppDefinition.create({
                name: 'a'.repeat(101),
                version: '1.0.0'
            });

            const result = appDef.validate();

            expect(result.isValid).toBe(false);
            expect(result.errors.some(e => e.includes('100 characters or less'))).toBe(true);
        });

        test('fails when description is too long', () => {
            const appDef = AppDefinition.create({
                name: 'my-app',
                version: '1.0.0',
                description: 'a'.repeat(1001)
            });

            const result = appDef.validate();

            expect(result.isValid).toBe(false);
            expect(result.errors.some(e => e.includes('1000 characters or less'))).toBe(true);
        });
    });

    describe('toJSON', () => {
        test('converts to JSON format', () => {
            const appDef = AppDefinition.create({
                name: 'my-app',
                version: '1.0.0',
                description: 'Test app',
                author: 'John Doe'
            });

            appDef.registerIntegration('test-integration');
            appDef.registerApiModule('salesforce', '2.0.0', 'npm');

            const json = appDef.toJSON();

            expect(json.name).toBe('my-app');
            expect(json.version).toBe('1.0.0');
            expect(json.description).toBe('Test app');
            expect(json.author).toBe('John Doe');
            expect(json.integrations).toHaveLength(1);
            expect(json.integrations[0].name).toBe('test-integration');
            expect(json.apiModules).toHaveLength(1);
            expect(json.apiModules[0].name).toBe('salesforce');
        });
    });
});
