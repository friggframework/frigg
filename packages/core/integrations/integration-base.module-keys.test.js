/**
 * Tests for IntegrationBase module key mapping
 *
 * Tests that modules are attached using keys from Definition.modules,
 * not the moduleName from the database.
 */

// Mock database config before importing IntegrationBase
jest.mock('../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
}));

const { IntegrationBase } = require('./integration-base');

// Mock module instances
class MockModule {
    constructor(moduleName) {
        this.name = moduleName;
        this.api = { mock: true };
    }

    getName() {
        return this.name;
    }
}

describe('IntegrationBase - Module Key Mapping', () => {
    describe('_appendModules() with custom module keys', () => {
        it('should attach modules using Definition.modules keys', () => {
            class TestIntegration extends IntegrationBase {
                static Definition = {
                    name: 'test-integration',
                    version: '1.0.0',
                    modules: {
                        attio: { definition: { moduleName: 'attio' } },
                        quo: { definition: { moduleName: 'quo-attio' } }, // Custom moduleName
                    },
                };
            }

            const integration = new TestIntegration();
            const attioModule = new MockModule('attio');
            const quoModule = new MockModule('quo-attio');

            integration.setIntegrationRecord({
                record: {
                    id: 1,
                    userId: 'user-123',
                    entities: [],
                    config: { type: 'test-integration' },
                },
                modules: [attioModule, quoModule],
            });

            // Should attach using keys from Definition.modules
            expect(integration.attio).toBe(attioModule);
            expect(integration.quo).toBe(quoModule); // Not integration['quo-attio']

            // Should NOT attach with moduleName
            expect(integration['quo-attio']).toBeUndefined();
        });

        it('should handle multiple integrations with same module but different keys', () => {
            class PipedriveIntegration extends IntegrationBase {
                static Definition = {
                    name: 'pipedrive-integration',
                    version: '1.0.0',
                    modules: {
                        pipedrive: { definition: { moduleName: 'pipedrive' } },
                        quo: { definition: { moduleName: 'quo-pipedrive' } },
                    },
                };
            }

            const integration = new PipedriveIntegration();
            const pipedriveModule = new MockModule('pipedrive');
            const quoModule = new MockModule('quo-pipedrive');

            integration.setIntegrationRecord({
                record: {
                    id: 2,
                    userId: 'user-456',
                    entities: [],
                    config: { type: 'pipedrive-integration' },
                },
                modules: [pipedriveModule, quoModule],
            });

            expect(integration.pipedrive).toBe(pipedriveModule);
            expect(integration.quo).toBe(quoModule);
            expect(integration['quo-pipedrive']).toBeUndefined();
        });

        it('should fallback to moduleName when key not found in Definition', () => {
            class LegacyIntegration extends IntegrationBase {
                static Definition = {
                    name: 'legacy-integration',
                    version: '1.0.0',
                    modules: {
                        hubspot: { definition: { moduleName: 'hubspot' } },
                    },
                };
            }

            const integration = new LegacyIntegration();
            const hubspotModule = new MockModule('hubspot');
            const unknownModule = new MockModule('unknown-module'); // Not in Definition

            integration.setIntegrationRecord({
                record: {
                    id: 3,
                    userId: 'user-789',
                    entities: [],
                    config: { type: 'legacy-integration' },
                },
                modules: [hubspotModule, unknownModule],
            });

            // Known module uses Definition key
            expect(integration.hubspot).toBe(hubspotModule);

            // Unknown module falls back to moduleName
            expect(integration['unknown-module']).toBe(unknownModule);
        });

        it('should handle empty modules array', () => {
            class EmptyIntegration extends IntegrationBase {
                static Definition = {
                    name: 'empty-integration',
                    version: '1.0.0',
                    modules: {},
                };
            }

            const integration = new EmptyIntegration();
            integration.setIntegrationRecord({
                record: {
                    id: 4,
                    userId: 'user-999',
                    entities: [],
                    config: { type: 'empty-integration' },
                },
                modules: [],
            });

            expect(integration.modules).toEqual({});
        });

        it('should handle Definition without modules property', () => {
            class NoModulesIntegration extends IntegrationBase {
                static Definition = {
                    name: 'no-modules-integration',
                    version: '1.0.0',
                    // No modules property
                };
            }

            const integration = new NoModulesIntegration();
            const someModule = new MockModule('some-module');

            integration.setIntegrationRecord({
                record: {
                    id: 5,
                    userId: 'user-111',
                    entities: [],
                    config: { type: 'no-modules-integration' },
                },
                modules: [someModule],
            });

            // Should fallback to moduleName
            expect(integration['some-module']).toBe(someModule);
        });

        it('should preserve modules object with original module names', () => {
            class TestIntegration extends IntegrationBase {
                static Definition = {
                    name: 'test',
                    version: '1.0.0',
                    modules: {
                        crm: { definition: { moduleName: 'crm-module' } },
                    },
                };
            }

            const integration = new TestIntegration();
            const crmModule = new MockModule('crm-module');

            integration.setIntegrationRecord({
                record: {
                    id: 6,
                    userId: 'user-222',
                    entities: [],
                    config: { type: 'test' },
                },
                modules: [crmModule],
            });

            // this.crm should exist (using Definition key)
            expect(integration.crm).toBe(crmModule);

            // this.modules should also use the Definition key
            expect(integration.modules.crm).toBe(crmModule);
            expect(integration.modules['crm-module']).toBeUndefined();
        });
    });
});
