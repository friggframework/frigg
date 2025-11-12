const {FileSystemAppDefinitionRepository} = require('../../../infrastructure/repositories/FileSystemAppDefinitionRepository');
const {AppDefinition} = require('../../../domain/entities/AppDefinition');

describe('FileSystemAppDefinitionRepository', () => {
    let repository;
    let mockFileSystemAdapter;
    let mockSchemaValidator;
    let projectRoot;

    beforeEach(() => {
        projectRoot = '/test/project';

        mockFileSystemAdapter = {
            exists: jest.fn(),
            ensureDirectory: jest.fn(),
            writeFile: jest.fn(),
            updateFile: jest.fn(),
            readFile: jest.fn(),
        };

        mockSchemaValidator = {
            validate: jest.fn(),
        };

        repository = new FileSystemAppDefinitionRepository(
            mockFileSystemAdapter,
            projectRoot,
            mockSchemaValidator
        );
    });

    describe('load', () => {
        it('should load app definition from file', async () => {
            const appDefJson = {
                name: 'my-frigg-app',
                version: '1.0.0',
                description: 'Test app',
                integrations: ['integration-1'],
                apiModules: ['salesforce', 'stripe'],
            };

            mockFileSystemAdapter.exists.mockResolvedValue(true);
            mockFileSystemAdapter.readFile.mockResolvedValue(JSON.stringify(appDefJson));

            const result = await repository.load();

            expect(result).toBeInstanceOf(AppDefinition);
            expect(result.name).toBe('my-frigg-app');
            expect(result.version.value).toBe('1.0.0');
            expect(result.integrations).toEqual(['integration-1']);
            expect(result.apiModules).toEqual(['salesforce', 'stripe']);
        });

        it('should return null if app definition does not exist', async () => {
            mockFileSystemAdapter.exists.mockResolvedValue(false);

            const result = await repository.load();

            expect(result).toBeNull();
        });

        it('should handle missing integrations array', async () => {
            const appDefJson = {
                name: 'my-frigg-app',
                version: '1.0.0',
                // no integrations field
            };

            mockFileSystemAdapter.exists.mockResolvedValue(true);
            mockFileSystemAdapter.readFile.mockResolvedValue(JSON.stringify(appDefJson));

            const result = await repository.load();

            expect(result).toBeInstanceOf(AppDefinition);
            expect(result.integrations).toEqual([]);
            expect(result.apiModules).toEqual([]);
        });
    });

    describe('save', () => {
        it('should save app definition to file', async () => {
            const appDef = AppDefinition.create({
                name: 'my-frigg-app',
                version: '1.0.0',
                description: 'Test app',
            });

            mockSchemaValidator.validate.mockResolvedValue({valid: true, errors: []});
            mockFileSystemAdapter.exists.mockResolvedValue(false);

            await repository.save(appDef);

            expect(mockFileSystemAdapter.ensureDirectory).toHaveBeenCalledWith(
                '/test/project/backend'
            );
            expect(mockFileSystemAdapter.writeFile).toHaveBeenCalledWith(
                '/test/project/backend/app-definition.json',
                expect.stringContaining('"name": "my-frigg-app"')
            );
        });

        it('should update existing app definition file', async () => {
            const appDef = AppDefinition.create({
                name: 'my-frigg-app',
                version: '1.0.0',
                description: 'Test app',
            });

            mockSchemaValidator.validate.mockResolvedValue({valid: true, errors: []});
            mockFileSystemAdapter.exists.mockResolvedValue(true);

            await repository.save(appDef);

            expect(mockFileSystemAdapter.updateFile).toHaveBeenCalled();
            expect(mockFileSystemAdapter.writeFile).not.toHaveBeenCalled();
        });

        it('should throw error if validation fails', async () => {
            const appDef = AppDefinition.create({
                name: 'my-frigg-app',
                version: '1.0.0',
            });

            // Mock validate to return invalid
            jest.spyOn(appDef, 'validate').mockReturnValue({
                isValid: false,
                errors: ['Invalid configuration'],
            });

            await expect(repository.save(appDef)).rejects.toThrow(
                'AppDefinition validation failed'
            );
        });

        it('should throw error if schema validation fails', async () => {
            const appDef = AppDefinition.create({
                name: 'my-frigg-app',
                version: '1.0.0',
            });

            mockSchemaValidator.validate.mockResolvedValue({
                valid: false,
                errors: ['Invalid schema'],
            });

            await expect(repository.save(appDef)).rejects.toThrow(
                'Schema validation failed'
            );
        });

        it('should save with integrations and API modules', async () => {
            const appDef = AppDefinition.create({
                name: 'my-frigg-app',
                version: '1.0.0',
            });

            appDef.registerIntegration('test-integration', {
                name: 'test-integration',
                version: '1.0.0',
                type: 'api',
            });

            appDef.registerApiModule('salesforce', {
                name: 'salesforce',
                version: '1.0.0',
                authType: 'oauth2',
            });

            mockSchemaValidator.validate.mockResolvedValue({valid: true, errors: []});
            mockFileSystemAdapter.exists.mockResolvedValue(false);

            await repository.save(appDef);

            const writeCall = mockFileSystemAdapter.writeFile.mock.calls[0];
            const savedData = JSON.parse(writeCall[1]);

            // AppDefinition stores integrations and apiModules as objects
            expect(savedData.integrations).toEqual([{
                name: 'test-integration',
                enabled: true,
            }]);
            // apiModules include name, source, and version object
            expect(savedData.apiModules).toHaveLength(1);
            expect(savedData.apiModules[0].name).toBe('salesforce');
            expect(savedData.apiModules[0].source).toBe('npm'); // default source
        });

        it('should format JSON with 2-space indentation', async () => {
            const appDef = AppDefinition.create({
                name: 'my-frigg-app',
                version: '1.0.0',
            });

            mockSchemaValidator.validate.mockResolvedValue({valid: true, errors: []});
            mockFileSystemAdapter.exists.mockResolvedValue(false);

            await repository.save(appDef);

            const writeCall = mockFileSystemAdapter.writeFile.mock.calls[0];
            const content = writeCall[1];

            // Check for 2-space indentation
            expect(content).toMatch(/{\n  "name"/);
        });
    });

    describe('exists', () => {
        it('should return true if app definition exists', async () => {
            mockFileSystemAdapter.exists.mockResolvedValue(true);

            const result = await repository.exists();

            expect(result).toBe(true);
            expect(mockFileSystemAdapter.exists).toHaveBeenCalledWith(
                '/test/project/backend/app-definition.json'
            );
        });

        it('should return false if app definition does not exist', async () => {
            mockFileSystemAdapter.exists.mockResolvedValue(false);

            const result = await repository.exists();

            expect(result).toBe(false);
        });
    });

    describe('create', () => {
        it('should create new app definition', async () => {
            mockFileSystemAdapter.exists.mockResolvedValue(false);
            mockSchemaValidator.validate.mockResolvedValue({valid: true, errors: []});

            const result = await repository.create({
                name: 'my-frigg-app',
                version: '1.0.0',
                description: 'Test app',
            });

            expect(result).toBeInstanceOf(AppDefinition);
            expect(result.name).toBe('my-frigg-app');
            expect(mockFileSystemAdapter.writeFile).toHaveBeenCalled();
        });

        it('should throw error if app definition already exists', async () => {
            mockFileSystemAdapter.exists.mockResolvedValue(true);

            await expect(
                repository.create({
                    name: 'my-frigg-app',
                    version: '1.0.0',
                })
            ).rejects.toThrow('App definition already exists');
        });

        it('should validate and save created app definition', async () => {
            mockFileSystemAdapter.exists.mockResolvedValue(false);
            mockSchemaValidator.validate.mockResolvedValue({valid: true, errors: []});

            await repository.create({
                name: 'my-frigg-app',
                version: '1.0.0',
            });

            expect(mockSchemaValidator.validate).toHaveBeenCalledWith(
                'app-definition',
                expect.any(Object)
            );
            expect(mockFileSystemAdapter.writeFile).toHaveBeenCalled();
        });
    });

    describe('_toDomainEntity', () => {
        it('should convert JSON to AppDefinition entity', () => {
            const data = {
                name: 'my-frigg-app',
                version: '1.0.0',
                description: 'Test app',
                author: 'Test Author',
                license: 'MIT',
                repository: 'https://github.com/test/repo',
                integrations: ['integration-1'],
                apiModules: ['salesforce'],
                config: {env: 'production'},
            };

            const result = repository._toDomainEntity(data);

            expect(result).toBeInstanceOf(AppDefinition);
            expect(result.name).toBe('my-frigg-app');
            expect(result.version.value).toBe('1.0.0');
            expect(result.description).toBe('Test app');
            expect(result.author).toBe('Test Author');
            expect(result.license).toBe('MIT');
            expect(result.repository).toBe('https://github.com/test/repo');
            expect(result.integrations).toEqual(['integration-1']);
            expect(result.apiModules).toEqual(['salesforce']);
            expect(result.config).toEqual({env: 'production'});
        });

        it('should handle minimal data', () => {
            const data = {
                name: 'my-frigg-app',
                version: '1.0.0',
            };

            const result = repository._toDomainEntity(data);

            expect(result).toBeInstanceOf(AppDefinition);
            expect(result.integrations).toEqual([]);
            expect(result.apiModules).toEqual([]);
            expect(result.config).toEqual({});
        });
    });
});
