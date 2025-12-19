const {
    generateOpenApiSpec,
    generateOpenApiYaml,
    clearCache,
    extractModuleMetadata,
    loadBaseSpec,
} = require('./openapi-spec-generator');

describe('OpenAPI Spec Generator', () => {
    beforeEach(() => {
        clearCache();
    });

    describe('loadBaseSpec', () => {
        it('loads the base OpenAPI spec file', () => {
            const spec = loadBaseSpec();
            expect(spec).toBeDefined();
            expect(spec.openapi).toBe('3.0.3');
            expect(spec.info.title).toBe('Frigg Framework API');
        });
    });

    describe('extractModuleMetadata', () => {
        it('extracts metadata from module definition with getName method', () => {
            const mockModule = {
                Definition: {
                    getName: () => 'hubspot',
                    display: {
                        name: 'HubSpot',
                        description: 'CRM and marketing automation',
                    },
                    moduleName: 'hubspot-module',
                    modules: {
                        api: { authType: 'oauth2' },
                    },
                },
            };

            const metadata = extractModuleMetadata(mockModule);
            expect(metadata.name).toBe('hubspot');
            expect(metadata.displayName).toBe('HubSpot');
            expect(metadata.description).toBe('CRM and marketing automation');
            expect(metadata.authType).toBe('oauth2');
        });

        it('extracts metadata from module definition with name property', () => {
            const mockModule = {
                Definition: {
                    name: 'salesforce',
                    display: {
                        name: 'Salesforce',
                    },
                },
            };

            const metadata = extractModuleMetadata(mockModule);
            expect(metadata.name).toBe('salesforce');
            expect(metadata.displayName).toBe('Salesforce');
        });

        it('handles module without nested Definition', () => {
            const mockModule = {
                name: 'slack',
                display: { name: 'Slack' },
            };

            const metadata = extractModuleMetadata(mockModule);
            expect(metadata.name).toBe('slack');
        });

        it('returns unknown for missing module name', () => {
            const mockModule = {};
            const metadata = extractModuleMetadata(mockModule);
            expect(metadata.name).toBe('unknown');
        });
    });

    describe('generateOpenApiSpec', () => {
        it('returns base spec when no appDefinition provided', () => {
            const spec = generateOpenApiSpec(null);
            expect(spec).toBeDefined();
            expect(spec.openapi).toBe('3.0.3');
            expect(spec.info['x-generated']).toBeDefined();
            expect(spec.info['x-generated'].moduleCount).toBe(0);
        });

        it('includes generation metadata', () => {
            const spec = generateOpenApiSpec(null);
            expect(spec.info['x-generated'].timestamp).toBeDefined();
            expect(spec.info['x-generated'].modules).toEqual([]);
        });

        it('adds custom server URL when provided', () => {
            const spec = generateOpenApiSpec(null, {
                serverUrl: 'http://localhost:3001',
            });
            expect(spec.servers[0].url).toBe('http://localhost:3001');
            expect(spec.servers[0].description).toBe('Current server');
        });

        it('enriches spec with installed modules', () => {
            const appDefinition = {
                integrations: [
                    {
                        Definition: {
                            getName: () => 'hubspot',
                            display: {
                                name: 'HubSpot',
                                description: 'Marketing automation',
                            },
                            modules: { api: { authType: 'oauth2' } },
                        },
                    },
                    {
                        Definition: {
                            getName: () => 'salesforce',
                            display: {
                                name: 'Salesforce',
                                description: 'CRM platform',
                            },
                            modules: { api: { authType: 'oauth2' } },
                        },
                    },
                ],
            };

            const spec = generateOpenApiSpec(appDefinition);
            expect(spec.info['x-generated'].moduleCount).toBe(2);
            expect(spec.info['x-generated'].modules).toContain('hubspot');
            expect(spec.info['x-generated'].modules).toContain('salesforce');
            expect(spec.info.description).toContain('## Installed Modules');
            expect(spec.info.description).toContain('HubSpot');
        });

        it('uses cached spec when caching enabled', () => {
            const appDef = { integrations: [] };
            const spec1 = generateOpenApiSpec(appDef, { useCache: true });
            const spec2 = generateOpenApiSpec(appDef, { useCache: true });

            // Same reference (cached)
            expect(spec1).toBe(spec2);
        });

        it('regenerates spec when caching disabled', () => {
            const appDef = { integrations: [] };
            const spec1 = generateOpenApiSpec(appDef, { useCache: false });
            const spec2 = generateOpenApiSpec(appDef, { useCache: false });

            // Different references (regenerated)
            expect(spec1).not.toBe(spec2);
        });

        it('handles modules that fail to process', () => {
            const appDefinition = {
                integrations: [
                    null, // Invalid module
                    {
                        Definition: {
                            getName: () => 'valid',
                            display: { name: 'Valid' },
                        },
                    },
                ],
            };

            const spec = generateOpenApiSpec(appDefinition);
            expect(spec.info['x-generated'].moduleCount).toBe(1);
            expect(spec.info['x-generated'].modules).toContain('valid');
        });
    });

    describe('generateOpenApiYaml', () => {
        it('returns YAML string', () => {
            const yaml = generateOpenApiYaml(null);
            expect(typeof yaml).toBe('string');
            expect(yaml).toContain('openapi: 3.0.3');
            expect(yaml).toContain('title: Frigg Framework API');
        });
    });

    describe('clearCache', () => {
        it('clears cached spec', () => {
            const appDef = { integrations: [] };
            const spec1 = generateOpenApiSpec(appDef);

            clearCache();

            const spec2 = generateOpenApiSpec(appDef);
            expect(spec1).not.toBe(spec2);
        });
    });
});
