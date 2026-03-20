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

import { IntegrationBase } from './integration-base';

class MockModule {
    name: string;
    api: { mock: boolean };

    constructor(moduleName: string) {
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
                static readonly Definition = {
                    name: 'test-integration',
                    version: '1.0.0',
                    modules: {
                        attio: { definition: { moduleName: 'attio' } },
                        quo: { definition: { moduleName: 'quo-attio' } },
                    },
                };
            }

            const integration = new TestIntegration() as any;
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

            expect(integration.attio).toBe(attioModule);
            expect(integration.quo).toBe(quoModule);

            expect(integration['quo-attio']).toBeUndefined();
        });

        it('should handle multiple integrations with same module but different keys', () => {
            class PipedriveIntegration extends IntegrationBase {
                static readonly Definition = {
                    name: 'pipedrive-integration',
                    version: '1.0.0',
                    modules: {
                        pipedrive: { definition: { moduleName: 'pipedrive' } },
                        quo: { definition: { moduleName: 'quo-pipedrive' } },
                    },
                };
            }

            const integration = new PipedriveIntegration() as any;
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
                static readonly Definition = {
                    name: 'legacy-integration',
                    version: '1.0.0',
                    modules: {
                        hubspot: { definition: { moduleName: 'hubspot' } },
                    },
                };
            }

            const integration = new LegacyIntegration() as any;
            const hubspotModule = new MockModule('hubspot');
            const unknownModule = new MockModule('unknown-module');

            integration.setIntegrationRecord({
                record: {
                    id: 3,
                    userId: 'user-789',
                    entities: [],
                    config: { type: 'legacy-integration' },
                },
                modules: [hubspotModule, unknownModule],
            });

            expect(integration.hubspot).toBe(hubspotModule);

            expect(integration['unknown-module']).toBe(unknownModule);
        });

        it('should handle empty modules array', () => {
            class EmptyIntegration extends IntegrationBase {
                static readonly Definition = {
                    name: 'empty-integration',
                    version: '1.0.0',
                    modules: {},
                };
            }

            const integration = new EmptyIntegration() as any;
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
                static readonly Definition = {
                    name: 'no-modules-integration',
                    version: '1.0.0',
                };
            }

            const integration = new NoModulesIntegration() as any;
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

            expect(integration['some-module']).toBe(someModule);
        });

        it('should preserve modules object with original module names', () => {
            class TestIntegration extends IntegrationBase {
                static readonly Definition = {
                    name: 'test',
                    version: '1.0.0',
                    modules: {
                        crm: { definition: { moduleName: 'crm-module' } },
                    },
                };
            }

            const integration = new TestIntegration() as any;
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

            expect(integration.crm).toBe(crmModule);

            expect(integration.modules.crm).toBe(crmModule);
            expect(integration.modules['crm-module']).toBeUndefined();
        });
    });
});
