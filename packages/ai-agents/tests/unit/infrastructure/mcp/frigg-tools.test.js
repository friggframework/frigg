const {
    createFriggMcpTools,
    validateSchemaHandler,
    getTemplateHandler,
    checkPatternsHandler,
    listModulesHandler,
    runTestsHandler,
    securityScanHandler,
    gitCheckpointHandler,
    getExampleHandler,
    searchDocsHandler,
    readDocsHandler,
    setGitCheckpointService,
    NPMRegistryService,
    INTEGRATION_CATEGORIES,
    INTEGRATION_TYPES,
    CATEGORY_TEMPLATES,
    DOCS_INDEX
} = require('../../../../src/infrastructure/mcp/frigg-tools');

describe('Frigg MCP Tools', () => {
    describe('createFriggMcpTools', () => {
        it('should create array of tool definitions', () => {
            const tools = createFriggMcpTools();

            expect(Array.isArray(tools)).toBe(true);
            expect(tools.length).toBeGreaterThan(0);
        });

        it('should have required tools', () => {
            const tools = createFriggMcpTools();
            const toolNames = tools.map(t => t.name);

            expect(toolNames).toContain('frigg_validate_schema');
            expect(toolNames).toContain('frigg_get_template');
            expect(toolNames).toContain('frigg_check_patterns');
            expect(toolNames).toContain('frigg_list_modules');
            expect(toolNames).toContain('frigg_run_tests');
            expect(toolNames).toContain('frigg_security_scan');
            expect(toolNames).toContain('frigg_git_checkpoint');
            expect(toolNames).toContain('frigg_get_example');
            expect(toolNames).toContain('frigg_search_docs');
            expect(toolNames).toContain('frigg_read_docs');
        });

        it('each tool should have name, description, and handler', () => {
            const tools = createFriggMcpTools();

            for (const tool of tools) {
                expect(tool).toHaveProperty('name');
                expect(tool).toHaveProperty('description');
                expect(tool).toHaveProperty('inputSchema');
                expect(tool).toHaveProperty('handler');
                expect(typeof tool.handler).toBe('function');
            }
        });

        it('should accept gitCheckpointService option', () => {
            const mockService = { createCheckpoint: jest.fn() };
            const tools = createFriggMcpTools({ gitCheckpointService: mockService });
            expect(tools).toBeDefined();
        });
    });

    describe('frigg_validate_schema', () => {
        it('should validate valid integration definition', async () => {
            const validDefinition = {
                name: 'hubspot-integration',
                version: '1.0.0',
                modules: {
                    hubspot: { definition: {} }
                },
                options: {
                    display: {
                        name: 'HubSpot'
                    }
                }
            };

            const result = await validateSchemaHandler({
                schemaType: 'integration-definition',
                content: JSON.stringify(validDefinition)
            });

            expect(result.valid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        it('should accept valid category enum values', async () => {
            const validDefinition = {
                name: 'hubspot',
                version: '1.0.0',
                options: {
                    type: 'api',
                    display: {
                        category: 'CRM',
                        name: 'HubSpot'
                    }
                }
            };

            const result = await validateSchemaHandler({
                schemaType: 'integration-definition',
                content: JSON.stringify(validDefinition)
            });

            expect(result.valid).toBe(true);
        });

        it('should reject invalid category', async () => {
            const invalidDefinition = {
                name: 'test',
                version: '1.0.0',
                options: {
                    display: {
                        category: 'InvalidCategory'
                    }
                }
            };

            const result = await validateSchemaHandler({
                schemaType: 'integration-definition',
                content: JSON.stringify(invalidDefinition)
            });

            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('category'))).toBe(true);
        });

        it('should reject invalid integration type', async () => {
            const invalidDefinition = {
                name: 'test',
                version: '1.0.0',
                options: {
                    type: 'invalid-type'
                }
            };

            const result = await validateSchemaHandler({
                schemaType: 'integration-definition',
                content: JSON.stringify(invalidDefinition)
            });

            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('type'))).toBe(true);
        });

        it('should reject invalid integration definition', async () => {
            const invalidDefinition = {
                name: 'invalid_name!',
                version: 'not-semver'
            };

            const result = await validateSchemaHandler({
                schemaType: 'integration-definition',
                content: JSON.stringify(invalidDefinition)
            });

            expect(result.valid).toBe(false);
            expect(result.errors).toBeDefined();
            expect(result.errors.length).toBeGreaterThan(0);
        });

        it('should handle malformed JSON', async () => {
            const result = await validateSchemaHandler({
                schemaType: 'integration-definition',
                content: 'not valid json {'
            });

            expect(result.valid).toBe(false);
            expect(result.errors[0]).toContain('JSON');
        });

        it('should accept object content directly', async () => {
            const result = await validateSchemaHandler({
                schemaType: 'integration-definition',
                content: { name: 'test', version: '1.0.0' }
            });

            expect(result.valid).toBe(true);
        });

        it('should provide warnings for missing modules', async () => {
            const definition = {
                name: 'test',
                version: '1.0.0'
            };

            const result = await validateSchemaHandler({
                schemaType: 'integration-definition',
                content: JSON.stringify(definition)
            });

            expect(result.warnings).toBeDefined();
            expect(result.warnings.some(w => w.includes('modules'))).toBe(true);
        });

        it('should validate api-module-definition', async () => {
            const moduleDefinition = {
                name: 'hubspot',
                authType: 'oauth2'
            };

            const result = await validateSchemaHandler({
                schemaType: 'api-module-definition',
                content: JSON.stringify(moduleDefinition)
            });

            expect(result.valid).toBe(true);
        });

        it('should validate app-definition', async () => {
            const appDefinition = {
                name: 'my-app',
                integrations: [{ Definition: {} }]
            };

            const result = await validateSchemaHandler({
                schemaType: 'app-definition',
                content: JSON.stringify(appDefinition)
            });

            expect(result.valid).toBe(true);
        });

        it('should reject invalid auth capabilities', async () => {
            const definition = {
                name: 'test',
                version: '1.0.0',
                capabilities: {
                    auth: ['invalid-auth-type']
                }
            };

            const result = await validateSchemaHandler({
                schemaType: 'integration-definition',
                content: JSON.stringify(definition)
            });

            expect(result.valid).toBe(false);
            expect(result.errors.some(e => e.includes('auth'))).toBe(true);
        });
    });

    describe('frigg_get_template', () => {
        it('should return CRM integration template', async () => {
            const result = await getTemplateHandler({
                category: 'CRM',
                integrationName: 'hubspot'
            });

            expect(result.template).toBeDefined();
            expect(result.template).toContain('class HubspotIntegration');
            expect(result.template).toContain('IntegrationBase');
            expect(result.template).toContain('onCreate');
            expect(result.template).toContain("category: 'CRM'");
            expect(result.suggestedFilename).toBe('hubspot-integration.js');
        });

        it('should return Finance integration template', async () => {
            const result = await getTemplateHandler({
                category: 'Finance',
                integrationName: 'stripe'
            });

            expect(result.template).toContain("category: 'Finance'");
            expect(result.template).toContain('syncInvoices');
        });

        it('should return Communication integration template', async () => {
            const result = await getTemplateHandler({
                category: 'Communication',
                integrationName: 'slack'
            });

            expect(result.template).toContain('onWebhookReceived');
            expect(result.template).toContain('challenge');
        });

        it('should return ECommerce integration template', async () => {
            const result = await getTemplateHandler({
                category: 'ECommerce',
                integrationName: 'shopify'
            });

            expect(result.template).toContain('syncOrders');
            expect(result.template).toContain('syncProducts');
        });

        it('should return Webhook-only integration template', async () => {
            const result = await getTemplateHandler({
                category: 'Webhook',
                integrationName: 'custom-webhook'
            });

            expect(result.template).toContain("type: 'webhook'");
            expect(result.template).toContain('verifySignature');
            expect(result.template).toContain('webhookSecret');
        });

        it('should return Sync integration template', async () => {
            const result = await getTemplateHandler({
                category: 'Sync',
                integrationName: 'hubspot-salesforce',
                options: {
                    sourceModule: 'hubspot',
                    targetModule: 'salesforce'
                }
            });

            expect(result.template).toContain("type: 'sync'");
            expect(result.template).toContain('syncDirection');
            expect(result.template).toContain('conflictResolution');
        });

        it('should include webhooks when requested', async () => {
            const result = await getTemplateHandler({
                category: 'CRM',
                integrationName: 'hubspot',
                options: { webhooks: true }
            });

            expect(result.template).toContain('onWebhookReceived');
            expect(result.template).toContain('onWebhook');
        });

        it('should return error for unknown category', async () => {
            const result = await getTemplateHandler({
                category: 'UnknownCategory',
                integrationName: 'test'
            });

            expect(result.error).toBeDefined();
            expect(result.availableCategories).toBeDefined();
        });

        it('should use default name if not provided', async () => {
            const result = await getTemplateHandler({
                category: 'CRM'
            });

            expect(result.template).toContain('MyIntegration');
        });
    });

    describe('frigg_check_patterns', () => {
        it('should pass valid integration code', async () => {
            const validCode = `
                class HubSpotIntegration extends IntegrationBase {
                    static Definition = {
                        name: 'hubspot',
                        version: '1.0.0',
                        modules: {}
                    };

                    async onCreate({ integrationId }) {
                        await this.updateIntegrationStatus.execute(integrationId, 'ENABLED');
                    }
                    async onUpdate(params) {}
                    async onDelete(params) {}
                    async getConfigOptions() { return { jsonSchema: {}, uiSchema: {} }; }
                    async testAuth() { return true; }
                }
            `;

            const result = await checkPatternsHandler({
                code: validCode,
                fileType: 'integration'
            });

            expect(result.compliant).toBe(true);
            expect(result.violations.filter(v => v.severity === 'error')).toHaveLength(0);
        });

        it('should detect missing IntegrationBase extension', async () => {
            const invalidCode = `
                class HubSpotIntegration {
                    static Definition = { name: 'hubspot', version: '1.0.0' };
                }
            `;

            const result = await checkPatternsHandler({
                code: invalidCode,
                fileType: 'integration'
            });

            expect(result.compliant).toBe(false);
            expect(result.violations.some(v => v.rule === 'extends-integration-base')).toBe(true);
        });

        it('should detect missing lifecycle methods as warnings', async () => {
            const incompleteCode = `
                class HubSpotIntegration extends IntegrationBase {
                    static Definition = { name: 'hubspot', version: '1.0.0' };
                }
            `;

            const result = await checkPatternsHandler({
                code: incompleteCode,
                fileType: 'integration'
            });

            expect(result.violations.some(v => v.rule === 'lifecycle-methods')).toBe(true);
        });

        it('should detect webhook handlers missing when webhooks enabled', async () => {
            const webhookCode = `
                class HubSpotIntegration extends IntegrationBase {
                    static Definition = {
                        name: 'hubspot',
                        version: '1.0.0',
                        capabilities: { webhooks: true }
                    };
                    async onCreate() {}
                    async onUpdate() {}
                    async onDelete() {}
                    async getConfigOptions() {}
                    async testAuth() {}
                }
            `;

            const result = await checkPatternsHandler({
                code: webhookCode,
                fileType: 'integration'
            });

            expect(result.violations.some(v => v.rule === 'webhook-handlers')).toBe(true);
        });

        it('should check api-module patterns', async () => {
            const moduleCode = `
                class HubSpotApi extends OAuth2Requester {
                    async testAuth() { return true; }
                }
            `;

            const result = await checkPatternsHandler({
                code: moduleCode,
                fileType: 'api-module'
            });

            expect(result.compliant).toBe(true);
        });

        it('should suggest updateIntegrationStatus usage', async () => {
            const code = `
                class TestIntegration extends IntegrationBase {
                    static Definition = { name: 'test', version: '1.0.0' };
                    async onCreate() {}
                    async onUpdate() {}
                    async onDelete() {}
                    async getConfigOptions() {}
                    async testAuth() {}
                }
            `;

            const result = await checkPatternsHandler({
                code,
                fileType: 'integration'
            });

            expect(result.suggestions).toBeDefined();
            expect(result.suggestions.some(s => s.rule === 'status-updates')).toBe(true);
        });
    });

    describe('frigg_list_modules', () => {
        it('should return modules array with metadata', async () => {
            const result = await listModulesHandler({});

            expect(result).toHaveProperty('modules');
            expect(result).toHaveProperty('total');
            expect(result).toHaveProperty('source', 'npm-registry');
        });

        it('should filter by category when provided', async () => {
            const npmService = new NPMRegistryService();
            const mockModules = [
                { name: 'hubspot', category: 'CRM' },
                { name: 'slack', category: 'Communication' }
            ];

            jest.spyOn(npmService, 'searchApiModules').mockResolvedValue(mockModules.filter(m => m.category === 'CRM'));

            const result = await listModulesHandler({ category: 'CRM' });
            expect(result.source).toBe('npm-registry');
        });
    });

    describe('frigg_security_scan', () => {
        it('should detect hardcoded API keys', async () => {
            // Use a clearly fake test key pattern that won't trigger secret scanning
            const code = `const api_key = "test_fake_key_for_unit_testing_only_12345";`;

            const result = await securityScanHandler({ code, scanType: 'credentials' });

            expect(result.vulnerabilities.length).toBeGreaterThan(0);
            expect(result.vulnerabilities.some(v => v.type === 'hardcoded-credential')).toBe(true);
        });

        it('should detect eval usage', async () => {
            const code = `const result = eval(userInput);`;

            const result = await securityScanHandler({ code, scanType: 'injection' });

            expect(result.vulnerabilities.some(v => v.type === 'code-injection')).toBe(true);
        });

        it('should detect missing webhook signature verification', async () => {
            const code = `
                async onWebhookReceived({ req, res }) {
                    await this.processWebhook(req.body);
                    res.status(200).send();
                }
            `;

            const result = await securityScanHandler({ code, scanType: 'validation' });

            expect(result.vulnerabilities.some(v => v.type === 'missing-webhook-validation')).toBe(true);
        });

        it('should pass clean code', async () => {
            const code = `
                async onWebhookReceived({ req, res }) {
                    const signature = req.headers['x-webhook-signature'];
                    if (!this.verifySignature(req.body, signature)) {
                        return res.status(401).send();
                    }
                    res.status(200).send();
                }
            `;

            const result = await securityScanHandler({ code });

            expect(result.vulnerabilities.filter(v => v.type === 'missing-webhook-validation')).toHaveLength(0);
        });

        it('should provide scan summary', async () => {
            const result = await securityScanHandler({ code: 'const x = 1;' });

            expect(result.scanned).toBe(true);
            expect(result.summary).toBeDefined();
        });
    });

    describe('frigg_git_checkpoint', () => {
        it('should use injected GitCheckpointService when available', async () => {
            const mockCheckpoint = {
                id: 'checkpoint-123',
                hash: 'abc123',
                message: 'test checkpoint',
                timestamp: new Date(),
                hasPendingChanges: false
            };
            const mockService = {
                createCheckpoint: jest.fn().mockResolvedValue(mockCheckpoint)
            };

            setGitCheckpointService(mockService);

            const result = await gitCheckpointHandler({ message: 'test checkpoint' });

            expect(mockService.createCheckpoint).toHaveBeenCalledWith('test checkpoint');
            expect(result.checkpointId).toBe('checkpoint-123');
            expect(result.hash).toBe('abc123');
            expect(result.rollbackCommand).toContain('abc123');

            setGitCheckpointService(null);
        });

        it('should handle service errors gracefully', async () => {
            const mockService = {
                createCheckpoint: jest.fn().mockRejectedValue(new Error('Git error'))
            };

            setGitCheckpointService(mockService);

            const result = await gitCheckpointHandler({ message: 'test' });

            expect(result.error).toBeDefined();
            expect(result.fallback).toBe(true);

            setGitCheckpointService(null);
        });
    });

    describe('frigg_get_example', () => {
        it('should return CRM integration example', async () => {
            const result = await getExampleHandler({ pattern: 'crm-integration' });

            expect(result.code).toBeDefined();
            expect(result.description).toBeDefined();
            expect(result.code).toContain('IntegrationBase');
        });

        it('should return webhook handler example', async () => {
            const result = await getExampleHandler({ pattern: 'webhook-handler' });

            expect(result.code).toContain('verifySignature');
            expect(result.code).toContain('onWebhookReceived');
        });

        it('should return form config example', async () => {
            const result = await getExampleHandler({ pattern: 'form-config' });

            expect(result.code).toContain('jsonSchema');
            expect(result.code).toContain('uiSchema');
            expect(result.code).toContain('getConfigOptions');
        });

        it('should return oauth2 flow example', async () => {
            const result = await getExampleHandler({ pattern: 'oauth2-flow' });

            expect(result.code).toContain('getAuthorizationUri');
            expect(result.code).toContain('getAccessToken');
            expect(result.code).toContain('refreshAccessToken');
        });

        it('should return sync pattern example', async () => {
            const result = await getExampleHandler({ pattern: 'sync-pattern' });

            expect(result.code).toContain('syncDirection');
            expect(result.code).toContain('conflictResolution');
        });

        it('should return api-module-complete example', async () => {
            const result = await getExampleHandler({ pattern: 'api-module-complete' });

            expect(result.code).toContain('OAuth2Requester');
            expect(result.code).toContain('testAuth');
            expect(result.code).toContain('listContacts');
        });

        it('should return error for unknown pattern', async () => {
            const result = await getExampleHandler({ pattern: 'unknown-pattern' });

            expect(result.error).toBeDefined();
            expect(result.availablePatterns).toBeDefined();
            expect(result.availablePatterns.length).toBeGreaterThan(0);
        });
    });

    describe('NPMRegistryService', () => {
        it('should format package info correctly', () => {
            const service = new NPMRegistryService();
            const pkg = {
                name: '@friggframework/api-module-hubspot',
                version: '1.0.0',
                description: 'HubSpot CRM API module'
            };

            const result = service.formatPackageInfo(pkg);

            expect(result.name).toBe('hubspot');
            expect(result.fullName).toBe('@friggframework/api-module-hubspot');
            expect(result.displayName).toBe('Hubspot');
            expect(result.category).toBe('CRM');
        });

        it('should categorize modules correctly', () => {
            const service = new NPMRegistryService();

            expect(service.categorizeModule('hubspot', 'CRM platform')).toBe('CRM');
            expect(service.categorizeModule('slack', 'messaging app')).toBe('Communication');
            expect(service.categorizeModule('stripe', 'payment processing')).toBe('Finance');
            expect(service.categorizeModule('shopify', 'e-commerce')).toBe('ECommerce');
            expect(service.categorizeModule('unknown', 'some tool')).toBe('Other');
        });

        it('should infer auth type correctly', () => {
            const service = new NPMRegistryService();

            expect(service.inferAuthType('test', 'uses api key')).toBe('api-key');
            expect(service.inferAuthType('test', 'oauth integration')).toBe('oauth2');
        });
    });

    describe('Constants', () => {
        it('should export valid integration categories', () => {
            expect(INTEGRATION_CATEGORIES).toContain('CRM');
            expect(INTEGRATION_CATEGORIES).toContain('Finance');
            expect(INTEGRATION_CATEGORIES).toContain('Communication');
            expect(INTEGRATION_CATEGORIES).toContain('ECommerce');
            expect(INTEGRATION_CATEGORIES).toContain('Storage');
        });

        it('should export valid integration types', () => {
            expect(INTEGRATION_TYPES).toContain('api');
            expect(INTEGRATION_TYPES).toContain('webhook');
            expect(INTEGRATION_TYPES).toContain('sync');
            expect(INTEGRATION_TYPES).toContain('transform');
            expect(INTEGRATION_TYPES).toContain('custom');
        });

        it('should export category templates', () => {
            expect(CATEGORY_TEMPLATES).toHaveProperty('CRM');
            expect(CATEGORY_TEMPLATES).toHaveProperty('Finance');
            expect(CATEGORY_TEMPLATES).toHaveProperty('Communication');
            expect(CATEGORY_TEMPLATES).toHaveProperty('ECommerce');
            expect(CATEGORY_TEMPLATES).toHaveProperty('Storage');
            expect(CATEGORY_TEMPLATES).toHaveProperty('Webhook');
            expect(CATEGORY_TEMPLATES).toHaveProperty('Sync');
        });

        it('should export docs index', () => {
            expect(DOCS_INDEX).toHaveProperty('integration-base');
            expect(DOCS_INDEX).toHaveProperty('api-module');
            expect(DOCS_INDEX).toHaveProperty('webhooks');
            expect(DOCS_INDEX).toHaveProperty('forms-config');
            expect(DOCS_INDEX).toHaveProperty('encryption');
        });
    });

    describe('frigg_search_docs', () => {
        it('should search documentation by query', async () => {
            const result = await searchDocsHandler({ query: 'webhook signature' });

            expect(result.query).toBe('webhook signature');
            expect(result.results).toBeDefined();
            expect(result.results.length).toBeGreaterThan(0);
            expect(result.results[0]).toHaveProperty('title');
            expect(result.results[0]).toHaveProperty('summary');
            expect(result.results[0]).toHaveProperty('relevance');
        });

        it('should filter by topic', async () => {
            const result = await searchDocsHandler({ query: 'authentication', topic: 'webhooks' });

            expect(result.topic).toBe('webhooks');
        });

        it('should limit results', async () => {
            const result = await searchDocsHandler({ query: 'integration', limit: 2 });

            expect(result.results.length).toBeLessThanOrEqual(2);
        });

        it('should rank results by relevance', async () => {
            const result = await searchDocsHandler({ query: 'integration lifecycle' });

            expect(result.results[0].relevance).toBeGreaterThanOrEqual(result.results[result.results.length - 1].relevance);
        });

        it('should return empty results for no matches', async () => {
            const result = await searchDocsHandler({ query: 'xyznonexistent123' });

            expect(result.results).toHaveLength(0);
            expect(result.totalMatches).toBe(0);
        });
    });

    describe('frigg_read_docs', () => {
        it('should read documentation by key', async () => {
            const result = await readDocsHandler({ docKey: 'integration-base' });

            expect(result.key).toBe('integration-base');
            expect(result.title).toBe('IntegrationBase Class');
            expect(result.summary).toBeDefined();
            expect(result.topics).toContain('integration');
        });

        it('should return sections for integration-base', async () => {
            const result = await readDocsHandler({ docKey: 'integration-base' });

            expect(result.sections).toBeDefined();
            expect(result.sections).toHaveProperty('static-definition');
            expect(result.sections).toHaveProperty('lifecycle-methods');
            expect(result.sections).toHaveProperty('webhook-methods');
        });

        it('should return specific section when requested', async () => {
            const result = await readDocsHandler({ docKey: 'integration-base', section: 'lifecycle-methods' });

            expect(result.section).toBeDefined();
            expect(result.section.title).toBe('Lifecycle Methods');
            expect(result.section.content).toContain('onCreate');
        });

        it('should return sections for forms-config', async () => {
            const result = await readDocsHandler({ docKey: 'forms-config' });

            expect(result.sections).toBeDefined();
            expect(result.sections).toHaveProperty('json-schema');
            expect(result.sections).toHaveProperty('dynamic-options');
        });

        it('should return sections for webhooks', async () => {
            const result = await readDocsHandler({ docKey: 'webhooks' });

            expect(result.sections).toBeDefined();
            expect(result.sections).toHaveProperty('signature-verification');
            expect(result.sections).toHaveProperty('event-processing');
        });

        it('should return error for unknown key', async () => {
            const result = await readDocsHandler({ docKey: 'nonexistent' });

            expect(result.error).toBeDefined();
            expect(result.availableDocs).toBeDefined();
            expect(result.availableDocs.length).toBeGreaterThan(0);
        });

        it('should list available docs on error', async () => {
            const result = await readDocsHandler({ docKey: 'unknown' });

            expect(result.availableDocs.some(d => d.key === 'integration-base')).toBe(true);
            expect(result.availableDocs.some(d => d.key === 'webhooks')).toBe(true);
        });
    });
});
