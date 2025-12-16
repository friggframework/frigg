const { Options } = require('../options');
const { RequiredPropertyError } = require('../../errors');

describe('Options', () => {
    // Mock module with required definition.getName()
    const mockModule = {
        definition: {
            getName: () => 'test-module'
        }
    };

    describe('required fields', () => {
        it('throws RequiredPropertyError when display is missing', () => {
            expect(() => new Options({
                module: mockModule,
                modules: { test: mockModule }
            })).toThrow(RequiredPropertyError);
        });

        it('throws RequiredPropertyError when display.label is missing', () => {
            expect(() => new Options({
                module: mockModule,
                modules: { test: mockModule },
                display: {
                    description: 'Test description'
                }
            })).toThrow(RequiredPropertyError);
        });

        it('throws RequiredPropertyError when display.description is missing', () => {
            expect(() => new Options({
                module: mockModule,
                modules: { test: mockModule },
                display: {
                    label: 'Test Label'
                }
            })).toThrow(RequiredPropertyError);
        });
    });

    describe('optional fields', () => {
        it('allows missing detailsUrl', () => {
            const options = new Options({
                module: mockModule,
                modules: { test: mockModule },
                display: {
                    label: 'Test Label',
                    description: 'Test description'
                }
            });

            expect(options.display.detailsUrl).toBeNull();
        });

        it('allows missing icon', () => {
            const options = new Options({
                module: mockModule,
                modules: { test: mockModule },
                display: {
                    label: 'Test Label',
                    description: 'Test description'
                }
            });

            expect(options.display.icon).toBeNull();
        });

        it('accepts detailsUrl when provided', () => {
            const options = new Options({
                module: mockModule,
                modules: { test: mockModule },
                display: {
                    label: 'Test Label',
                    description: 'Test description',
                    detailsUrl: 'https://example.com'
                }
            });

            expect(options.display.detailsUrl).toBe('https://example.com');
        });

        it('accepts icon when provided', () => {
            const options = new Options({
                module: mockModule,
                modules: { test: mockModule },
                display: {
                    label: 'Test Label',
                    description: 'Test description',
                    icon: 'test-icon.svg'
                }
            });

            expect(options.display.icon).toBe('test-icon.svg');
        });
    });

    describe('minimal valid configuration', () => {
        it('creates Options with only required fields', () => {
            const options = new Options({
                module: mockModule,
                modules: { test: mockModule },
                display: {
                    label: 'Test Integration',
                    description: 'A minimal test integration'
                }
            });

            expect(options.display.name).toBe('Test Integration');
            expect(options.display.description).toBe('A minimal test integration');
            expect(options.display.detailsUrl).toBeNull();
            expect(options.display.icon).toBeNull();
        });

        it('get() returns proper structure with minimal config', () => {
            const options = new Options({
                module: mockModule,
                modules: { test: mockModule },
                display: {
                    label: 'Test Integration',
                    description: 'A minimal test integration'
                }
            });

            const result = options.get();

            expect(result.type).toBe('test-module');
            expect(result.hasUserConfig).toBe(false);
            expect(result.requiredEntities).toEqual(['test']);
            expect(result.display).toEqual({
                name: 'Test Integration',
                description: 'A minimal test integration',
                detailsUrl: null,
                icon: null
            });
        });
    });

    describe('full configuration', () => {
        it('creates Options with all fields', () => {
            const options = new Options({
                module: mockModule,
                modules: { test: mockModule, other: mockModule },
                hasUserConfig: true,
                display: {
                    label: 'Full Integration',
                    description: 'An integration with all display fields',
                    detailsUrl: 'https://docs.example.com/integration',
                    icon: 'https://cdn.example.com/icon.png'
                }
            });

            const result = options.get();

            expect(result.type).toBe('test-module');
            expect(result.hasUserConfig).toBe(true);
            expect(result.requiredEntities).toEqual(['test', 'other']);
            expect(result.display).toEqual({
                name: 'Full Integration',
                description: 'An integration with all display fields',
                detailsUrl: 'https://docs.example.com/integration',
                icon: 'https://cdn.example.com/icon.png'
            });
        });
    });

    describe('display.name vs display.label', () => {
        it('maps display.label to display.name in output', () => {
            const options = new Options({
                module: mockModule,
                modules: { test: mockModule },
                display: {
                    label: 'My Label',
                    description: 'Test'
                }
            });

            // Input uses 'label', output uses 'name'
            expect(options.display.name).toBe('My Label');
        });
    });

    describe('module type resolution', () => {
        it('uses getName() method when available', () => {
            const options = new Options({
                module: mockModule,
                modules: { test: mockModule },
                display: {
                    label: 'Test',
                    description: 'Test'
                }
            });

            const result = options.get();
            expect(result.type).toBe('test-module');
        });

        it('falls back to moduleName property when getName() is not available', () => {
            const moduleWithModuleName = {
                definition: {
                    moduleName: 'xero'
                    // No getName() method
                }
            };

            const options = new Options({
                module: moduleWithModuleName,
                modules: { xero: moduleWithModuleName },
                display: {
                    label: 'Xero',
                    description: 'Accounting software'
                }
            });

            const result = options.get();
            expect(result.type).toBe('xero');
        });

        it('falls back to name property when neither getName() nor moduleName exist', () => {
            const moduleWithName = {
                definition: {
                    name: 'legacy-module'
                }
            };

            const options = new Options({
                module: moduleWithName,
                modules: { legacy: moduleWithName },
                display: {
                    label: 'Legacy',
                    description: 'Legacy module'
                }
            });

            const result = options.get();
            expect(result.type).toBe('legacy-module');
        });

        it('returns "unknown" when no module type can be determined', () => {
            const moduleWithoutType = {
                definition: {}
            };

            const options = new Options({
                module: moduleWithoutType,
                modules: { empty: moduleWithoutType },
                display: {
                    label: 'Empty',
                    description: 'Empty module'
                }
            });

            const result = options.get();
            expect(result.type).toBe('unknown');
        });

        it('handles null/undefined module definition gracefully', () => {
            const moduleWithNullDef = {
                definition: null
            };

            const options = new Options({
                module: moduleWithNullDef,
                modules: { empty: moduleWithNullDef },
                display: {
                    label: 'Null Def',
                    description: 'Null definition'
                }
            });

            const result = options.get();
            expect(result.type).toBe('unknown');
        });
    });
});
