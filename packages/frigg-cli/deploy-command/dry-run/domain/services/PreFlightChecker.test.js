/**
 * PreFlightChecker Service Tests
 *
 * Comprehensive test suite for the PreFlightChecker domain service
 * following TDD principles
 */

const { PreFlightChecker } = require('./PreFlightChecker');
const { ValidationResult } = require('../value-objects/ValidationResult');

describe('PreFlightChecker', () => {
    let mockFileSystem;
    let checker;

    beforeEach(() => {
        // Create mock file system for dependency injection
        mockFileSystem = {
            fileExists: jest.fn(),
            readFile: jest.fn(),
            resolvePath: jest.fn((basePath, fileName) => {
                // Combine paths properly
                if (fileName) {
                    return `${basePath}/${fileName}`;
                }
                return basePath;
            }),
        };

        checker = new PreFlightChecker(mockFileSystem);
    });

    describe('constructor', () => {
        it('should create PreFlightChecker with file system dependency', () => {
            const checker = new PreFlightChecker(mockFileSystem);

            expect(checker).toBeInstanceOf(PreFlightChecker);
        });

        it('should require file system dependency', () => {
            expect(() => {
                new PreFlightChecker();
            }).toThrow('File system dependency is required');
        });

        it('should validate file system has required methods', () => {
            const invalidFs = {
                fileExists: jest.fn(),
                // Missing readFile and resolvePath
            };

            expect(() => {
                new PreFlightChecker(invalidFs);
            }).toThrow('File system must implement fileExists, readFile, and resolvePath methods');
        });
    });

    describe('check()', () => {
        describe('when all files exist and app definition is valid', () => {
            const validAppDefinition = {
                name: 'test-app',
                provider: 'aws',
                region: 'us-east-1',
                stage: 'dev',
            };

            beforeEach(() => {
                mockFileSystem.fileExists.mockResolvedValue(true);
                mockFileSystem.readFile.mockImplementation((filePath) => {
                    if (filePath === '/test/app/infrastructure.js') {
                        return Promise.resolve(`module.exports = ${JSON.stringify(validAppDefinition)};`);
                    }
                    if (filePath === '/test/app/package.json') {
                        return Promise.resolve(JSON.stringify({ name: 'test-app', version: '1.0.0' }));
                    }
                    return Promise.resolve('');
                });
            });

            it('should return successful validation result', async () => {
                const result = await checker.check('/test/app');

                expect(result).toBeInstanceOf(ValidationResult);
                expect(result.valid).toBe(true);
                expect(result.hasErrors()).toBe(false);
            });

            it('should check for all required files', async () => {
                await checker.check('/test/app');

                expect(mockFileSystem.fileExists).toHaveBeenCalledWith('/test/app/index.js');
                expect(mockFileSystem.fileExists).toHaveBeenCalledWith('/test/app/infrastructure.js');
                expect(mockFileSystem.fileExists).toHaveBeenCalledWith('/test/app/package.json');
            });

            it('should load and validate app definition', async () => {
                await checker.check('/test/app');

                expect(mockFileSystem.readFile).toHaveBeenCalledWith('/test/app/infrastructure.js');
            });

            it('should return app definition in metadata', async () => {
                const result = await checker.check('/test/app');

                expect(result.metadata.appDefinition).toEqual(validAppDefinition);
            });

            it('should return files found in metadata', async () => {
                const result = await checker.check('/test/app');

                expect(result.metadata.files).toEqual({
                    indexJs: true,
                    infrastructureJs: true,
                    packageJson: true,
                });
            });

            it('should return app name in metadata', async () => {
                const result = await checker.check('/test/app');

                expect(result.metadata.appName).toBe('test-app');
            });

            it('should return provider in metadata', async () => {
                const result = await checker.check('/test/app');

                expect(result.metadata.provider).toBe('aws');
            });

            it('should return region in metadata', async () => {
                const result = await checker.check('/test/app');

                expect(result.metadata.region).toBe('us-east-1');
            });

            it('should return stage in metadata', async () => {
                const result = await checker.check('/test/app');

                expect(result.metadata.stage).toBe('dev');
            });
        });

        describe('when app definition has optional configurations', () => {
            it('should handle app definition with VPC configuration', async () => {
                const appDefWithVpc = {
                    name: 'test-app',
                    provider: 'aws',
                    region: 'us-east-1',
                    vpc: {
                        enable: true,
                        createNew: false,
                    },
                };

                mockFileSystem.fileExists.mockResolvedValue(true);
                mockFileSystem.readFile.mockImplementation((filePath) => {
                    if (filePath === '/test/app/infrastructure.js') {
                        return Promise.resolve(`module.exports = ${JSON.stringify(appDefWithVpc)};`);
                    }
                    return Promise.resolve('{}');
                });

                const result = await checker.check('/test/app');

                expect(result.valid).toBe(true);
                expect(result.metadata.appDefinition.vpc).toEqual({
                    enable: true,
                    createNew: false,
                });
                expect(result.metadata.hasVpc).toBe(true);
            });

            it('should handle app definition with database configuration', async () => {
                const appDefWithDb = {
                    name: 'test-app',
                    provider: 'aws',
                    region: 'us-east-1',
                    database: {
                        postgres: {
                            enable: true,
                        },
                    },
                };

                mockFileSystem.fileExists.mockResolvedValue(true);
                mockFileSystem.readFile.mockImplementation((filePath) => {
                    if (filePath === '/test/app/infrastructure.js') {
                        return Promise.resolve(`module.exports = ${JSON.stringify(appDefWithDb)};`);
                    }
                    return Promise.resolve('{}');
                });

                const result = await checker.check('/test/app');

                expect(result.valid).toBe(true);
                expect(result.metadata.appDefinition.database).toEqual({
                    postgres: {
                        enable: true,
                    },
                });
                expect(result.metadata.hasDatabase).toBe(true);
            });

            it('should handle app definition with integrations', async () => {
                const appDefWithIntegrations = {
                    name: 'test-app',
                    provider: 'aws',
                    region: 'us-east-1',
                    integrations: [
                        { Definition: { name: 'hubspot' } },
                        { Definition: { name: 'salesforce' } },
                    ],
                };

                mockFileSystem.fileExists.mockResolvedValue(true);
                mockFileSystem.readFile.mockImplementation((filePath) => {
                    if (filePath === '/test/app/infrastructure.js') {
                        return Promise.resolve(`module.exports = ${JSON.stringify(appDefWithIntegrations)};`);
                    }
                    return Promise.resolve('{}');
                });

                const result = await checker.check('/test/app');

                expect(result.valid).toBe(true);
                expect(result.metadata.appDefinition.integrations).toHaveLength(2);
                expect(result.metadata.hasIntegrations).toBe(true);
                expect(result.metadata.integrationCount).toBe(2);
            });

            it('should handle app definition with encryption configuration', async () => {
                const appDefWithEncryption = {
                    name: 'test-app',
                    provider: 'aws',
                    region: 'us-east-1',
                    encryption: {
                        enable: true,
                    },
                };

                mockFileSystem.fileExists.mockResolvedValue(true);
                mockFileSystem.readFile.mockImplementation((filePath) => {
                    if (filePath === '/test/app/infrastructure.js') {
                        return Promise.resolve(`module.exports = ${JSON.stringify(appDefWithEncryption)};`);
                    }
                    return Promise.resolve('{}');
                });

                const result = await checker.check('/test/app');

                expect(result.valid).toBe(true);
                expect(result.metadata.hasEncryption).toBe(true);
            });

            it('should handle app definition with websockets', async () => {
                const appDefWithWebsockets = {
                    name: 'test-app',
                    provider: 'aws',
                    region: 'us-east-1',
                    websockets: {
                        enable: true,
                    },
                };

                mockFileSystem.fileExists.mockResolvedValue(true);
                mockFileSystem.readFile.mockImplementation((filePath) => {
                    if (filePath === '/test/app/infrastructure.js') {
                        return Promise.resolve(`module.exports = ${JSON.stringify(appDefWithWebsockets)};`);
                    }
                    return Promise.resolve('{}');
                });

                const result = await checker.check('/test/app');

                expect(result.valid).toBe(true);
                expect(result.metadata.hasWebsockets).toBe(true);
            });

            it('should handle app definition with SSM configuration', async () => {
                const appDefWithSsm = {
                    name: 'test-app',
                    provider: 'aws',
                    region: 'us-east-1',
                    ssm: {
                        enable: true,
                    },
                };

                mockFileSystem.fileExists.mockResolvedValue(true);
                mockFileSystem.readFile.mockImplementation((filePath) => {
                    if (filePath === '/test/app/infrastructure.js') {
                        return Promise.resolve(`module.exports = ${JSON.stringify(appDefWithSsm)};`);
                    }
                    return Promise.resolve('{}');
                });

                const result = await checker.check('/test/app');

                expect(result.valid).toBe(true);
                expect(result.metadata.hasSsm).toBe(true);
            });

            it('should handle minimal app definition without optional configurations', async () => {
                const minimalAppDef = {
                    name: 'test-app',
                    provider: 'aws',
                    region: 'us-east-1',
                };

                mockFileSystem.fileExists.mockResolvedValue(true);
                mockFileSystem.readFile.mockImplementation((filePath) => {
                    if (filePath === '/test/app/infrastructure.js') {
                        return Promise.resolve(`module.exports = ${JSON.stringify(minimalAppDef)};`);
                    }
                    return Promise.resolve('{}');
                });

                const result = await checker.check('/test/app');

                expect(result.valid).toBe(true);
                expect(result.metadata.hasVpc).toBe(false);
                expect(result.metadata.hasDatabase).toBe(false);
                expect(result.metadata.hasIntegrations).toBe(false);
                expect(result.metadata.hasEncryption).toBe(false);
                expect(result.metadata.hasWebsockets).toBe(false);
                expect(result.metadata.hasSsm).toBe(false);
                expect(result.metadata.integrationCount).toBe(0);
            });
        });

        describe('when files are missing', () => {
            const validAppDefinition = {
                name: 'test-app',
                provider: 'aws',
                region: 'us-east-1',
            };

            beforeEach(() => {
                mockFileSystem.readFile.mockImplementation((filePath) => {
                    if (filePath === '/test/app/infrastructure.js') {
                        return Promise.resolve(`module.exports = ${JSON.stringify(validAppDefinition)};`);
                    }
                    return Promise.resolve('{}');
                });
            });

            it('should fail when index.js is missing', async () => {
                mockFileSystem.fileExists.mockImplementation((filePath) => {
                    if (filePath === '/test/app/index.js') {
                        return Promise.resolve(false);
                    }
                    return Promise.resolve(true);
                });

                const result = await checker.check('/test/app');

                expect(result).toBeInstanceOf(ValidationResult);
                expect(result.valid).toBe(false);
                expect(result.hasErrors()).toBe(true);
                expect(result.errors).toContain('Missing required file: index.js');
            });

            it('should fail when infrastructure.js is missing', async () => {
                mockFileSystem.fileExists.mockImplementation((filePath) => {
                    if (filePath === '/test/app/infrastructure.js') {
                        return Promise.resolve(false);
                    }
                    return Promise.resolve(true);
                });

                const result = await checker.check('/test/app');

                expect(result.valid).toBe(false);
                expect(result.hasErrors()).toBe(true);
                expect(result.errors).toContain('Missing required file: infrastructure.js');
            });

            it('should fail when package.json is missing', async () => {
                mockFileSystem.fileExists.mockImplementation((filePath) => {
                    if (filePath === '/test/app/package.json') {
                        return Promise.resolve(false);
                    }
                    return Promise.resolve(true);
                });

                const result = await checker.check('/test/app');

                expect(result.valid).toBe(false);
                expect(result.hasErrors()).toBe(true);
                expect(result.errors).toContain('Missing required file: package.json');
            });

            it('should report all missing files', async () => {
                mockFileSystem.fileExists.mockResolvedValue(false);

                const result = await checker.check('/test/app');

                expect(result.valid).toBe(false);
                expect(result.errors).toHaveLength(3);
                expect(result.errors).toContain('Missing required file: index.js');
                expect(result.errors).toContain('Missing required file: infrastructure.js');
                expect(result.errors).toContain('Missing required file: package.json');
            });

            it('should include files found in metadata when some are missing', async () => {
                mockFileSystem.fileExists.mockImplementation((filePath) => {
                    if (filePath === '/test/app/index.js') {
                        return Promise.resolve(false);
                    }
                    return Promise.resolve(true);
                });

                const result = await checker.check('/test/app');

                expect(result.metadata.files).toEqual({
                    indexJs: false,
                    infrastructureJs: true,
                    packageJson: true,
                });
            });
        });

        describe('when app definition is invalid', () => {
            beforeEach(() => {
                mockFileSystem.fileExists.mockResolvedValue(true);
                mockFileSystem.readFile.mockImplementation((filePath) => {
                    if (filePath === '/test/app/package.json') {
                        return Promise.resolve(JSON.stringify({ name: 'test-app' }));
                    }
                    return Promise.resolve('');
                });
            });

            it('should fail when app definition is not an object', async () => {
                mockFileSystem.readFile.mockImplementation((filePath) => {
                    if (filePath === '/test/app/infrastructure.js') {
                        return Promise.resolve('module.exports = "not an object";');
                    }
                    return Promise.resolve('{}');
                });

                const result = await checker.check('/test/app');

                expect(result.valid).toBe(false);
                expect(result.hasErrors()).toBe(true);
                expect(result.errors).toContain('App definition must be an object');
            });

            it('should fail when app definition is null', async () => {
                mockFileSystem.readFile.mockImplementation((filePath) => {
                    if (filePath === '/test/app/infrastructure.js') {
                        return Promise.resolve('module.exports = null;');
                    }
                    return Promise.resolve('{}');
                });

                const result = await checker.check('/test/app');

                expect(result.valid).toBe(false);
                expect(result.hasErrors()).toBe(true);
                expect(result.errors).toContain('App definition must be an object');
            });

            it('should fail when app definition is an array', async () => {
                mockFileSystem.readFile.mockImplementation((filePath) => {
                    if (filePath === '/test/app/infrastructure.js') {
                        return Promise.resolve('module.exports = [];');
                    }
                    return Promise.resolve('{}');
                });

                const result = await checker.check('/test/app');

                expect(result.valid).toBe(false);
                expect(result.hasErrors()).toBe(true);
                expect(result.errors).toContain('App definition must be an object');
            });

            it('should fail when infrastructure.js has invalid syntax', async () => {
                mockFileSystem.readFile.mockImplementation((filePath) => {
                    if (filePath === '/test/app/infrastructure.js') {
                        return Promise.resolve('module.exports = { invalid syntax');
                    }
                    return Promise.resolve('{}');
                });

                const result = await checker.check('/test/app');

                expect(result.valid).toBe(false);
                expect(result.hasErrors()).toBe(true);
                expect(result.errors).toContain('Failed to parse infrastructure.js: Invalid JavaScript syntax');
            });
        });

        describe('when app definition has missing required properties', () => {
            beforeEach(() => {
                mockFileSystem.fileExists.mockResolvedValue(true);
                mockFileSystem.readFile.mockImplementation((filePath) => {
                    if (filePath === '/test/app/package.json') {
                        return Promise.resolve(JSON.stringify({ name: 'test-app' }));
                    }
                    return Promise.resolve('');
                });
            });

            it('should fail when name is missing', async () => {
                const appDefWithoutName = {
                    provider: 'aws',
                    region: 'us-east-1',
                };

                mockFileSystem.readFile.mockImplementation((filePath) => {
                    if (filePath === '/test/app/infrastructure.js') {
                        return Promise.resolve(`module.exports = ${JSON.stringify(appDefWithoutName)};`);
                    }
                    return Promise.resolve('{}');
                });

                const result = await checker.check('/test/app');

                expect(result.valid).toBe(false);
                expect(result.hasErrors()).toBe(true);
                expect(result.errors).toContain('App definition must have a name');
            });

            it('should fail when provider is missing', async () => {
                const appDefWithoutProvider = {
                    name: 'test-app',
                    region: 'us-east-1',
                };

                mockFileSystem.readFile.mockImplementation((filePath) => {
                    if (filePath === '/test/app/infrastructure.js') {
                        return Promise.resolve(`module.exports = ${JSON.stringify(appDefWithoutProvider)};`);
                    }
                    return Promise.resolve('{}');
                });

                const result = await checker.check('/test/app');

                expect(result.valid).toBe(false);
                expect(result.hasErrors()).toBe(true);
                expect(result.errors).toContain('App definition must have a provider');
            });

            it('should fail when region is missing', async () => {
                const appDefWithoutRegion = {
                    name: 'test-app',
                    provider: 'aws',
                };

                mockFileSystem.readFile.mockImplementation((filePath) => {
                    if (filePath === '/test/app/infrastructure.js') {
                        return Promise.resolve(`module.exports = ${JSON.stringify(appDefWithoutRegion)};`);
                    }
                    return Promise.resolve('{}');
                });

                const result = await checker.check('/test/app');

                expect(result.valid).toBe(false);
                expect(result.hasErrors()).toBe(true);
                expect(result.errors).toContain('App definition must have a region');
            });

            it('should report all missing required properties', async () => {
                const emptyAppDef = {};

                mockFileSystem.readFile.mockImplementation((filePath) => {
                    if (filePath === '/test/app/infrastructure.js') {
                        return Promise.resolve(`module.exports = ${JSON.stringify(emptyAppDef)};`);
                    }
                    return Promise.resolve('{}');
                });

                const result = await checker.check('/test/app');

                expect(result.valid).toBe(false);
                expect(result.errors).toHaveLength(3);
                expect(result.errors).toContain('App definition must have a name');
                expect(result.errors).toContain('App definition must have a provider');
                expect(result.errors).toContain('App definition must have a region');
            });

            it('should fail when name is empty string', async () => {
                const appDefWithEmptyName = {
                    name: '',
                    provider: 'aws',
                    region: 'us-east-1',
                };

                mockFileSystem.readFile.mockImplementation((filePath) => {
                    if (filePath === '/test/app/infrastructure.js') {
                        return Promise.resolve(`module.exports = ${JSON.stringify(appDefWithEmptyName)};`);
                    }
                    return Promise.resolve('{}');
                });

                const result = await checker.check('/test/app');

                expect(result.valid).toBe(false);
                expect(result.errors).toContain('App definition must have a name');
            });

            it('should fail when provider is empty string', async () => {
                const appDefWithEmptyProvider = {
                    name: 'test-app',
                    provider: '',
                    region: 'us-east-1',
                };

                mockFileSystem.readFile.mockImplementation((filePath) => {
                    if (filePath === '/test/app/infrastructure.js') {
                        return Promise.resolve(`module.exports = ${JSON.stringify(appDefWithEmptyProvider)};`);
                    }
                    return Promise.resolve('{}');
                });

                const result = await checker.check('/test/app');

                expect(result.valid).toBe(false);
                expect(result.errors).toContain('App definition must have a provider');
            });

            it('should fail when region is empty string', async () => {
                const appDefWithEmptyRegion = {
                    name: 'test-app',
                    provider: 'aws',
                    region: '',
                };

                mockFileSystem.readFile.mockImplementation((filePath) => {
                    if (filePath === '/test/app/infrastructure.js') {
                        return Promise.resolve(`module.exports = ${JSON.stringify(appDefWithEmptyRegion)};`);
                    }
                    return Promise.resolve('{}');
                });

                const result = await checker.check('/test/app');

                expect(result.valid).toBe(false);
                expect(result.errors).toContain('App definition must have a region');
            });
        });

        describe('when file read errors occur', () => {
            beforeEach(() => {
                mockFileSystem.fileExists.mockResolvedValue(true);
            });

            it('should handle infrastructure.js read error', async () => {
                mockFileSystem.readFile.mockImplementation((filePath) => {
                    if (filePath === '/test/app/infrastructure.js') {
                        return Promise.reject(new Error('EACCES: permission denied'));
                    }
                    return Promise.resolve('{}');
                });

                const result = await checker.check('/test/app');

                expect(result.valid).toBe(false);
                expect(result.hasErrors()).toBe(true);
                expect(result.errors).toContain('Failed to read infrastructure.js: EACCES: permission denied');
            });

            it('should handle package.json read error', async () => {
                const validAppDef = {
                    name: 'test-app',
                    provider: 'aws',
                    region: 'us-east-1',
                };

                mockFileSystem.readFile.mockImplementation((filePath) => {
                    if (filePath === '/test/app/infrastructure.js') {
                        return Promise.resolve(`module.exports = ${JSON.stringify(validAppDef)};`);
                    }
                    if (filePath === '/test/app/package.json') {
                        return Promise.reject(new Error('ENOENT: no such file'));
                    }
                    return Promise.resolve('');
                });

                const result = await checker.check('/test/app');

                expect(result.valid).toBe(false);
                expect(result.hasErrors()).toBe(true);
                expect(result.errors).toContain('Failed to read package.json: ENOENT: no such file');
            });

            it('should handle file system error during existence check', async () => {
                mockFileSystem.fileExists.mockRejectedValue(new Error('File system error'));

                const result = await checker.check('/test/app');

                expect(result.valid).toBe(false);
                expect(result.hasErrors()).toBe(true);
                expect(result.errors[0]).toContain('Pre-flight check failed');
            });

            it('should handle invalid JSON in package.json', async () => {
                const validAppDef = {
                    name: 'test-app',
                    provider: 'aws',
                    region: 'us-east-1',
                };

                mockFileSystem.readFile.mockImplementation((filePath) => {
                    if (filePath === '/test/app/infrastructure.js') {
                        return Promise.resolve(`module.exports = ${JSON.stringify(validAppDef)};`);
                    }
                    if (filePath === '/test/app/package.json') {
                        return Promise.resolve('{ invalid json }');
                    }
                    return Promise.resolve('');
                });

                const result = await checker.check('/test/app');

                expect(result.valid).toBe(false);
                expect(result.hasErrors()).toBe(true);
                expect(result.errors[0]).toContain('Failed to parse package.json');
            });
        });

        describe('path resolution', () => {
            const validAppDefinition = {
                name: 'test-app',
                provider: 'aws',
                region: 'us-east-1',
            };

            beforeEach(() => {
                mockFileSystem.fileExists.mockResolvedValue(true);
                mockFileSystem.readFile.mockImplementation((filePath) => {
                    if (filePath.endsWith('infrastructure.js')) {
                        return Promise.resolve(`module.exports = ${JSON.stringify(validAppDefinition)};`);
                    }
                    if (filePath.endsWith('package.json')) {
                        return Promise.resolve(JSON.stringify({ name: 'test-app' }));
                    }
                    return Promise.resolve('');
                });
            });

            it('should use resolvePath for all file operations', async () => {
                mockFileSystem.resolvePath.mockImplementation((basePath, fileName) => {
                    return `${basePath}/${fileName}`;
                });

                await checker.check('/test/app');

                expect(mockFileSystem.resolvePath).toHaveBeenCalledWith('/test/app', 'index.js');
                expect(mockFileSystem.resolvePath).toHaveBeenCalledWith('/test/app', 'infrastructure.js');
                expect(mockFileSystem.resolvePath).toHaveBeenCalledWith('/test/app', 'package.json');
            });

            it('should handle relative paths', async () => {
                mockFileSystem.resolvePath.mockImplementation((basePath, fileName) => {
                    return `${basePath}/${fileName}`;
                });

                await checker.check('./test/app');

                expect(mockFileSystem.resolvePath).toHaveBeenCalledTimes(3);
                expect(mockFileSystem.resolvePath).toHaveBeenCalledWith('./test/app', 'index.js');
            });
        });

        describe('metadata extraction', () => {
            beforeEach(() => {
                mockFileSystem.fileExists.mockResolvedValue(true);
            });

            it('should extract complete metadata from complex app definition', async () => {
                const complexAppDef = {
                    name: 'complex-app',
                    provider: 'aws',
                    region: 'eu-west-1',
                    stage: 'production',
                    vpc: { enable: true },
                    database: { postgres: { enable: true } },
                    encryption: { enable: true },
                    ssm: { enable: true },
                    websockets: { enable: true },
                    integrations: [
                        { Definition: { name: 'hubspot' } },
                        { Definition: { name: 'salesforce' } },
                        { Definition: { name: 'stripe' } },
                    ],
                };

                mockFileSystem.readFile.mockImplementation((filePath) => {
                    if (filePath === '/test/app/infrastructure.js') {
                        return Promise.resolve(`module.exports = ${JSON.stringify(complexAppDef)};`);
                    }
                    if (filePath === '/test/app/package.json') {
                        return Promise.resolve(JSON.stringify({ name: 'complex-app', version: '2.0.0' }));
                    }
                    return Promise.resolve('');
                });

                const result = await checker.check('/test/app');

                expect(result.valid).toBe(true);
                expect(result.metadata).toEqual({
                    appDefinition: complexAppDef,
                    appName: 'complex-app',
                    provider: 'aws',
                    region: 'eu-west-1',
                    stage: 'production',
                    files: {
                        indexJs: true,
                        infrastructureJs: true,
                        packageJson: true,
                    },
                    hasVpc: true,
                    hasDatabase: true,
                    hasEncryption: true,
                    hasSsm: true,
                    hasWebsockets: true,
                    hasIntegrations: true,
                    integrationCount: 3,
                });
            });

            it('should default stage to "dev" when not specified', async () => {
                const appDefWithoutStage = {
                    name: 'test-app',
                    provider: 'aws',
                    region: 'us-east-1',
                };

                mockFileSystem.readFile.mockImplementation((filePath) => {
                    if (filePath === '/test/app/infrastructure.js') {
                        return Promise.resolve(`module.exports = ${JSON.stringify(appDefWithoutStage)};`);
                    }
                    return Promise.resolve('{}');
                });

                const result = await checker.check('/test/app');

                expect(result.valid).toBe(true);
                expect(result.metadata.stage).toBe('dev');
            });

            it('should include partial metadata on validation failure', async () => {
                const invalidAppDef = {
                    name: 'test-app',
                    // Missing provider and region
                };

                mockFileSystem.readFile.mockImplementation((filePath) => {
                    if (filePath === '/test/app/infrastructure.js') {
                        return Promise.resolve(`module.exports = ${JSON.stringify(invalidAppDef)};`);
                    }
                    return Promise.resolve('{}');
                });

                const result = await checker.check('/test/app');

                expect(result.valid).toBe(false);
                expect(result.metadata.appDefinition).toEqual(invalidAppDef);
                expect(result.metadata.appName).toBe('test-app');
                expect(result.metadata.provider).toBeUndefined();
                expect(result.metadata.region).toBeUndefined();
            });
        });

        describe('edge cases', () => {
            it('should require appPath parameter', async () => {
                await expect(checker.check()).rejects.toThrow('App path is required');
            });

            it('should reject null appPath', async () => {
                await expect(checker.check(null)).rejects.toThrow('App path is required');
            });

            it('should reject empty string appPath', async () => {
                await expect(checker.check('')).rejects.toThrow('App path is required');
            });

            it('should handle app definition with undefined properties', async () => {
                const appDefWithUndefined = {
                    name: 'test-app',
                    provider: 'aws',
                    region: 'us-east-1',
                    vpc: undefined,
                    database: undefined,
                };

                mockFileSystem.fileExists.mockResolvedValue(true);
                mockFileSystem.readFile.mockImplementation((filePath) => {
                    if (filePath === '/test/app/infrastructure.js') {
                        return Promise.resolve(`module.exports = ${JSON.stringify(appDefWithUndefined)};`);
                    }
                    return Promise.resolve('{}');
                });

                const result = await checker.check('/test/app');

                expect(result.valid).toBe(true);
                expect(result.metadata.hasVpc).toBe(false);
                expect(result.metadata.hasDatabase).toBe(false);
            });
        });

        describe('return structure validation', () => {
            const validAppDefinition = {
                name: 'test-app',
                provider: 'aws',
                region: 'us-east-1',
            };

            beforeEach(() => {
                mockFileSystem.fileExists.mockResolvedValue(true);
                mockFileSystem.readFile.mockImplementation((filePath) => {
                    if (filePath === '/test/app/infrastructure.js') {
                        return Promise.resolve(`module.exports = ${JSON.stringify(validAppDefinition)};`);
                    }
                    return Promise.resolve('{}');
                });
            });

            it('should always return ValidationResult instance', async () => {
                const result = await checker.check('/test/app');

                expect(result).toBeInstanceOf(ValidationResult);
            });

            it('should return result with metadata property', async () => {
                const result = await checker.check('/test/app');

                expect(result).toHaveProperty('metadata');
                expect(typeof result.metadata).toBe('object');
            });

            it('should return result with all expected metadata fields', async () => {
                const result = await checker.check('/test/app');

                expect(result.metadata).toHaveProperty('appDefinition');
                expect(result.metadata).toHaveProperty('appName');
                expect(result.metadata).toHaveProperty('provider');
                expect(result.metadata).toHaveProperty('region');
                expect(result.metadata).toHaveProperty('stage');
                expect(result.metadata).toHaveProperty('files');
                expect(result.metadata).toHaveProperty('hasVpc');
                expect(result.metadata).toHaveProperty('hasDatabase');
                expect(result.metadata).toHaveProperty('hasEncryption');
                expect(result.metadata).toHaveProperty('hasSsm');
                expect(result.metadata).toHaveProperty('hasWebsockets');
                expect(result.metadata).toHaveProperty('hasIntegrations');
                expect(result.metadata).toHaveProperty('integrationCount');
            });

            it('should not include warnings for successful validation', async () => {
                const result = await checker.check('/test/app');

                expect(result.warnings).toEqual([]);
                expect(result.hasWarnings()).toBe(false);
            });

            it('should not include errors for successful validation', async () => {
                const result = await checker.check('/test/app');

                expect(result.errors).toEqual([]);
                expect(result.hasErrors()).toBe(false);
            });
        });
    });
});
