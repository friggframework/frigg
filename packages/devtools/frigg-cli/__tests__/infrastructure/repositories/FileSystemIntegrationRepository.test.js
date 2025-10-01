const {FileSystemIntegrationRepository} = require('../../../infrastructure/repositories/FileSystemIntegrationRepository');
const {Integration} = require('../../../domain/entities/Integration');
const {IntegrationName} = require('../../../domain/value-objects/IntegrationName');

describe('FileSystemIntegrationRepository', () => {
    let repository;
    let mockFileSystemAdapter;
    let mockSchemaValidator;
    let backendPath;

    beforeEach(() => {
        backendPath = '/test/project/backend';

        mockFileSystemAdapter = {
            exists: jest.fn(),
            ensureDirectory: jest.fn(),
            writeFile: jest.fn(),
            readFile: jest.fn(),
            listFiles: jest.fn(),
        };

        mockSchemaValidator = {
            validate: jest.fn(),
        };

        repository = new FileSystemIntegrationRepository(
            mockFileSystemAdapter,
            backendPath,
            mockSchemaValidator
        );
    });

    describe('save', () => {
        it('should save a new integration as a single file', async () => {
            const integration = new Integration({
                name: 'test-integration',
                version: '1.0.0',
                displayName: 'Test Integration',
                description: 'Test description',
                type: 'sync',
                category: 'CRM',
            });

            mockSchemaValidator.validate.mockResolvedValue({valid: true, errors: []});
            mockFileSystemAdapter.exists.mockResolvedValue(false); // Integration.js doesn't exist yet

            await repository.save(integration);

            // Verify integrations directory created
            expect(mockFileSystemAdapter.ensureDirectory).toHaveBeenCalledWith(
                '/test/project/backend/src/integrations'
            );

            // Verify schema validation
            expect(mockSchemaValidator.validate).toHaveBeenCalledWith(
                'integration-definition',
                expect.any(Object)
            );

            // Verify only Integration.js written
            expect(mockFileSystemAdapter.writeFile).toHaveBeenCalledTimes(1);

            // Verify Integration.js content
            const writeCall = mockFileSystemAdapter.writeFile.mock.calls[0];
            expect(writeCall[0]).toBe('/test/project/backend/src/integrations/TestIntegrationIntegration.js');
            expect(writeCall[1]).toContain('class TestIntegrationIntegration extends IntegrationBase');
            expect(writeCall[1]).toContain('static Definition = {');
            expect(writeCall[1]).toContain("name: 'test-integration'");
        });

        it('should NOT write Integration.js if it already exists', async () => {
            const integration = new Integration({
                name: 'test-integration',
                version: '1.0.0',
                displayName: 'Test Integration',
                description: 'Test description',
            });

            mockSchemaValidator.validate.mockResolvedValue({valid: true, errors: []});
            mockFileSystemAdapter.exists.mockResolvedValue(true); // Integration.js already exists

            await repository.save(integration);

            // Verify Integration.js NOT written
            expect(mockFileSystemAdapter.writeFile).not.toHaveBeenCalled();
        });

        it('should throw error if integration is invalid', async () => {
            // Create invalid integration (invalid type)
            const integration = new Integration({
                name: 'test-integration',
                version: '1.0.0',
                displayName: 'Test Integration',
                type: 'invalid-type',
            });

            await expect(repository.save(integration)).rejects.toThrow('Invalid integration');
        });

        it('should throw error if schema validation fails', async () => {
            const integration = new Integration({
                name: 'test-integration',
                version: '1.0.0',
                displayName: 'Test Integration',
            });

            mockSchemaValidator.validate.mockResolvedValue({
                valid: false,
                errors: ['Invalid schema'],
            });

            await expect(repository.save(integration)).rejects.toThrow('Schema validation failed');
        });

        it('should handle kebab-case to PascalCase conversion correctly', async () => {
            const integration = new Integration({
                name: 'my-awesome-api',
                version: '1.0.0',
                displayName: 'My Awesome API',
            });

            mockSchemaValidator.validate.mockResolvedValue({valid: true, errors: []});
            mockFileSystemAdapter.exists.mockResolvedValue(false);

            await repository.save(integration);

            const writeCall = mockFileSystemAdapter.writeFile.mock.calls[0];
            expect(writeCall[0]).toBe('/test/project/backend/src/integrations/MyAwesomeApiIntegration.js');
            expect(writeCall[1]).toContain('class MyAwesomeApiIntegration extends IntegrationBase');
        });
    });

    describe('findByName', () => {
        it('should find integration by name string', async () => {
            const integrationJsContent = `
                class TestIntegrationIntegration extends IntegrationBase {
                    static Definition = {
                        name: 'test-integration',
                        version: '1.0.0',
                        display: {
                            label: 'Test Integration',
                            description: 'Test description',
                        },
                    };
                }
                module.exports = TestIntegrationIntegration;
            `;

            mockFileSystemAdapter.exists.mockResolvedValue(true);
            mockFileSystemAdapter.readFile.mockResolvedValue(integrationJsContent);

            const result = await repository.findByName('test-integration');

            expect(result).toBeInstanceOf(Integration);
            expect(result.name.value).toBe('test-integration');
            expect(result.version.value).toBe('1.0.0');
        });

        it('should find integration by IntegrationName value object', async () => {
            const integrationJsContent = `
                class TestIntegrationIntegration extends IntegrationBase {
                    static Definition = {
                        name: 'test-integration',
                        version: '1.0.0',
                        display: {},
                    };
                }
            `;

            mockFileSystemAdapter.exists.mockResolvedValue(true);
            mockFileSystemAdapter.readFile.mockResolvedValue(integrationJsContent);

            const name = new IntegrationName('test-integration');
            const result = await repository.findByName(name);

            expect(result).toBeInstanceOf(Integration);
            expect(result.name.value).toBe('test-integration');
        });

        it('should return null if integration file does not exist', async () => {
            mockFileSystemAdapter.exists.mockResolvedValue(false);

            const result = await repository.findByName('nonexistent');

            expect(result).toBeNull();
        });
    });

    describe('exists', () => {
        it('should return true if integration exists', async () => {
            mockFileSystemAdapter.exists.mockResolvedValue(true);

            const result = await repository.exists('test-integration');

            expect(result).toBe(true);
            expect(mockFileSystemAdapter.exists).toHaveBeenCalledWith(
                '/test/project/backend/src/integrations/TestIntegrationIntegration.js'
            );
        });

        it('should return false if integration does not exist', async () => {
            mockFileSystemAdapter.exists.mockResolvedValue(false);

            const result = await repository.exists('nonexistent');

            expect(result).toBe(false);
        });

        it('should work with IntegrationName value object', async () => {
            mockFileSystemAdapter.exists.mockResolvedValue(true);

            const name = new IntegrationName('test-integration');
            const result = await repository.exists(name);

            expect(result).toBe(true);
        });
    });

    describe('list', () => {
        it('should return empty array if integrations directory does not exist', async () => {
            mockFileSystemAdapter.exists.mockResolvedValue(false);

            const result = await repository.list();

            expect(result).toEqual([]);
        });

        it('should return list of all integrations', async () => {
            mockFileSystemAdapter.exists.mockResolvedValue(true);
            mockFileSystemAdapter.listFiles.mockResolvedValue([
                'Integration1Integration.js',
                'Integration2Integration.js',
            ]);

            const integration1Content = `
                class Integration1Integration extends IntegrationBase {
                    static Definition = {
                        name: 'integration-1',
                        version: '1.0.0',
                        display: {},
                    };
                }
            `;

            const integration2Content = `
                class Integration2Integration extends IntegrationBase {
                    static Definition = {
                        name: 'integration-2',
                        version: '2.0.0',
                        display: {},
                    };
                }
            `;

            mockFileSystemAdapter.readFile
                .mockResolvedValueOnce(integration1Content)
                .mockResolvedValueOnce(integration2Content);

            const result = await repository.list();

            expect(result).toHaveLength(2);
            expect(result[0]).toBeInstanceOf(Integration);
            expect(result[0].name.value).toBe('integration-1');
            expect(result[1].name.value).toBe('integration-2');
        });

        it('should skip invalid integrations and log warning', async () => {
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

            mockFileSystemAdapter.exists.mockResolvedValue(true);
            mockFileSystemAdapter.listFiles.mockResolvedValue([
                'ValidIntegration.js',
                'InvalidIntegration.js',
            ]);

            const validContent = `
                class ValidIntegration extends IntegrationBase {
                    static Definition = {
                        name: 'valid-integration',
                        version: '1.0.0',
                        display: {},
                    };
                }
            `;

            mockFileSystemAdapter.readFile
                .mockResolvedValueOnce(validContent)
                .mockRejectedValueOnce(new Error('Read error'));

            const result = await repository.list();

            expect(result).toHaveLength(1);
            expect(result[0].name.value).toBe('valid-integration');
            expect(consoleWarnSpy).toHaveBeenCalledWith(
                expect.stringContaining('Failed to load integration'),
                expect.any(String)
            );

            consoleWarnSpy.mockRestore();
        });

        it('should filter out non-Integration files', async () => {
            mockFileSystemAdapter.exists.mockResolvedValue(true);
            mockFileSystemAdapter.listFiles.mockResolvedValue([
                'TestIntegration.js',
                'helper.js',
                'utils.js',
            ]);

            const integrationContent = `
                class TestIntegration extends IntegrationBase {
                    static Definition = {
                        name: 'test',
                        version: '1.0.0',
                        display: {},
                    };
                }
            `;

            mockFileSystemAdapter.readFile.mockResolvedValue(integrationContent);

            const result = await repository.list();

            // Should only process TestIntegration.js (ends with Integration.js)
            expect(mockFileSystemAdapter.readFile).toHaveBeenCalledTimes(1);
            expect(result).toHaveLength(1);
        });
    });

    describe('_generateIntegrationClass', () => {
        it('should generate valid Integration.js class file', () => {
            const integration = new Integration({
                name: 'my-test-integration',
                version: '1.0.0',
                displayName: 'My Test Integration',
                description: 'Test description',
                category: 'CRM',
            });

            const result = repository._generateIntegrationClass(integration);

            expect(result).toContain("const { IntegrationBase } = require('@friggframework/core');");
            expect(result).toContain('class MyTestIntegrationIntegration extends IntegrationBase');
            expect(result).toContain('static Definition = {');
            expect(result).toContain("name: 'my-test-integration'");
            expect(result).toContain("version: '1.0.0'");
            expect(result).toContain('modules: {');
            expect(result).toContain('routes: [');
            expect(result).toContain('module.exports = MyTestIntegrationIntegration');
        });

        it('should handle single-word integration names', () => {
            const integration = new Integration({
                name: 'salesforce',
                version: '1.0.0',
                displayName: 'Salesforce',
                description: 'Salesforce integration',
            });

            const result = repository._generateIntegrationClass(integration);

            expect(result).toContain('class SalesforceIntegration extends IntegrationBase');
            expect(result).toContain('module.exports = SalesforceIntegration');
        });

        it('should include proper JSDoc comments', () => {
            const integration = new Integration({
                name: 'test-integration',
                version: '1.0.0',
                displayName: 'Test Integration',
                description: 'Test description',
            });

            const result = repository._generateIntegrationClass(integration);

            expect(result).toContain('/**');
            expect(result).toContain('* Test Integration');
            expect(result).toContain('* Test description');
            expect(result).toContain('*/');
        });
    });

    describe('_parseStaticDefinition', () => {
        it('should parse static Definition from Integration.js content', () => {
            const content = `
                class TestIntegration extends IntegrationBase {
                    static Definition = {
                        name: 'test',
                        version: '1.0.0',
                        display: {
                            label: 'Test',
                            description: 'Test integration',
                        },
                    };
                }
            `;

            const result = repository._parseStaticDefinition(content);

            expect(result.name).toBe('test');
            expect(result.version).toBe('1.0.0');
            expect(result.display.label).toBe('Test');
        });

        it('should handle multi-line definition objects', () => {
            const content = `
                class ComplexIntegration extends IntegrationBase {
                    static Definition = {
                        name: 'complex',
                        version: '2.0.0',
                        modules: {
                            module1: { definition: module1.Definition },
                            module2: { definition: module2.Definition },
                        },
                        routes: [
                            { path: '/auth', method: 'GET' },
                        ],
                    };
                }
            `;

            const result = repository._parseStaticDefinition(content);

            expect(result.name).toBe('complex');
            expect(result.version).toBe('2.0.0');
            expect(result.modules).toBeDefined();
            expect(result.routes).toBeDefined();
        });
    });
});
