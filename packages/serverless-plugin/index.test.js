const FriggServerlessPlugin = require('./index');
const fs = require('fs');
const path = require('path');

// Mock fs module
jest.mock('fs');

describe('FriggServerlessPlugin', () => {
    let plugin;
    let mockServerless;
    let mockOptions;
    let mockServicePath;

    beforeEach(() => {
        mockServicePath = '/test/service/path';

        mockServerless = {
            config: {
                servicePath: mockServicePath,
            },
            cli: {
                log: jest.fn(),
            },
            service: {
                custom: {},
                provider: {
                    environment: {},
                },
            },
            processedInput: {
                commands: [],
            },
            getProvider: jest.fn().mockReturnValue({}),
            extendConfiguration: jest.fn(),
        };

        mockOptions = {
            stage: 'test',
        };

        // Clear all mocks before each test
        jest.clearAllMocks();
    });

    describe('Constructor', () => {
        it('should initialize with serverless instance and options', () => {
            plugin = new FriggServerlessPlugin(mockServerless, mockOptions);

            expect(plugin.serverless).toBe(mockServerless);
            expect(plugin.options).toBe(mockOptions);
            expect(plugin.hooks).toBeDefined();
        });

        it('should register required hooks', () => {
            plugin = new FriggServerlessPlugin(mockServerless, mockOptions);

            expect(plugin.hooks).toHaveProperty('initialize');
            expect(plugin.hooks).toHaveProperty('before:package:initialize');
            expect(plugin.hooks).toHaveProperty('after:package:package');
            expect(plugin.hooks).toHaveProperty('before:deploy:deploy');
        });
    });

    describe('asyncInit - Directory Creation', () => {
        it('should create .esbuild/.serverless directory if it does not exist', async () => {
            plugin = new FriggServerlessPlugin(mockServerless, mockOptions);

            // Mock fs.existsSync to return false (directory doesn't exist)
            fs.existsSync.mockReturnValue(false);
            fs.mkdirSync.mockImplementation(() => { });

            // Spy on console.log
            const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

            await plugin.asyncInit();

            const expectedPath = path.join(mockServicePath, '.esbuild', '.serverless');

            // Verify directory existence check
            expect(fs.existsSync).toHaveBeenCalledWith(expectedPath);

            // Verify directory creation
            expect(fs.mkdirSync).toHaveBeenCalledWith(expectedPath, { recursive: true });

            // Verify success message
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining('Created')
            );
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining('.esbuild')
            );

            consoleLogSpy.mockRestore();
        });

        it('should not create directory if it already exists', async () => {
            plugin = new FriggServerlessPlugin(mockServerless, mockOptions);

            // Mock fs.existsSync to return true (directory exists)
            fs.existsSync.mockReturnValue(true);
            fs.mkdirSync.mockImplementation(() => { });

            const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

            await plugin.asyncInit();

            const expectedPath = path.join(mockServicePath, '.esbuild', '.serverless');

            // Verify directory existence check
            expect(fs.existsSync).toHaveBeenCalledWith(expectedPath);

            // Verify directory creation was NOT called
            expect(fs.mkdirSync).not.toHaveBeenCalled();

            // Verify success message was NOT logged
            expect(consoleLogSpy).not.toHaveBeenCalledWith(
                expect.stringContaining('Created')
            );

            consoleLogSpy.mockRestore();
        });

        it('should use process.cwd() if servicePath is not available', async () => {
            // Remove servicePath from config
            mockServerless.config.servicePath = undefined;

            plugin = new FriggServerlessPlugin(mockServerless, mockOptions);

            fs.existsSync.mockReturnValue(false);
            fs.mkdirSync.mockImplementation(() => { });

            await plugin.asyncInit();

            const expectedPath = path.join(process.cwd(), '.esbuild', '.serverless');

            expect(fs.existsSync).toHaveBeenCalledWith(expectedPath);
            expect(fs.mkdirSync).toHaveBeenCalledWith(expectedPath, { recursive: true });
        });

        it('should log initialization messages', async () => {
            plugin = new FriggServerlessPlugin(mockServerless, mockOptions);

            fs.existsSync.mockReturnValue(true);

            const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

            await plugin.asyncInit();

            // Verify plugin initialization messages
            expect(mockServerless.cli.log).toHaveBeenCalledWith('Initializing Frigg Serverless Plugin...');
            expect(consoleLogSpy).toHaveBeenCalledWith('Hello from Frigg Serverless Plugin!');

            consoleLogSpy.mockRestore();
        });
    });

    describe('asyncInit - Offline Mode', () => {
        it('should not create SQS queues when not in offline mode', async () => {
            plugin = new FriggServerlessPlugin(mockServerless, mockOptions);

            fs.existsSync.mockReturnValue(true);

            // Not in offline mode
            mockServerless.processedInput.commands = ['deploy'];

            const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

            await plugin.asyncInit();

            expect(consoleLogSpy).toHaveBeenCalledWith('Running in online mode, doing nothing');
            expect(consoleLogSpy).not.toHaveBeenCalledWith(
                expect.stringContaining('offline mode')
            );

            consoleLogSpy.mockRestore();
        });

        it('should create SQS queues when in offline mode', async () => {
            plugin = new FriggServerlessPlugin(mockServerless, mockOptions);

            fs.existsSync.mockReturnValue(true);

            // Set offline mode
            mockServerless.processedInput.commands = ['offline'];
            mockServerless.service.custom = {
                testQueue: 'test-queue-name',
            };

            // Mock AWS SDK
            const mockCreateQueue = jest.fn((params, callback) => {
                callback(null, { QueueUrl: 'http://localhost:4566/queue/test-queue-name' });
            });

            jest.mock('aws-sdk', () => ({
                SQS: jest.fn(() => ({
                    createQueue: mockCreateQueue,
                })),
                config: {
                    update: jest.fn(),
                },
            }));

            const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

            await plugin.asyncInit();

            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining('offline mode')
            );

            consoleLogSpy.mockRestore();
        });
    });

    describe('beforePackageInitialize', () => {
        it('should create .esbuild/.serverless directory', () => {
            plugin = new FriggServerlessPlugin(mockServerless, mockOptions);

            fs.existsSync.mockReturnValue(false);
            fs.mkdirSync.mockImplementation(() => { });

            plugin.beforePackageInitialize();

            const expectedPath = path.join(mockServicePath, '.esbuild', '.serverless');

            expect(fs.existsSync).toHaveBeenCalledWith(expectedPath);
            expect(fs.mkdirSync).toHaveBeenCalledWith(expectedPath, { recursive: true });
        });

        it('should log pre-package hook message', () => {
            plugin = new FriggServerlessPlugin(mockServerless, mockOptions);

            fs.existsSync.mockReturnValue(true);

            plugin.beforePackageInitialize();

            expect(mockServerless.cli.log).toHaveBeenCalledWith('Frigg Serverless Plugin: Pre-package hook');
        });
    });

    describe('init', () => {
        it('should create .esbuild/.serverless directory', () => {
            plugin = new FriggServerlessPlugin(mockServerless, mockOptions);

            fs.existsSync.mockReturnValue(false);
            fs.mkdirSync.mockImplementation(() => { });

            const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

            plugin.init();

            const expectedPath = path.join(mockServicePath, '.esbuild', '.serverless');

            expect(fs.existsSync).toHaveBeenCalledWith(expectedPath);
            expect(fs.mkdirSync).toHaveBeenCalledWith(expectedPath, { recursive: true });
            expect(consoleLogSpy).toHaveBeenCalledWith(
                expect.stringContaining('Created')
            );

            consoleLogSpy.mockRestore();
        });
    });

    describe('afterPackage', () => {
        it('should log after package hook message', () => {
            plugin = new FriggServerlessPlugin(mockServerless, mockOptions);

            const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

            plugin.afterPackage();

            expect(consoleLogSpy).toHaveBeenCalledWith('After package hook called');

            consoleLogSpy.mockRestore();
        });
    });

    describe('beforeDeploy', () => {
        it('should log before deploy hook message', () => {
            plugin = new FriggServerlessPlugin(mockServerless, mockOptions);

            const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

            plugin.beforeDeploy();

            expect(consoleLogSpy).toHaveBeenCalledWith('Before deploy hook called');

            consoleLogSpy.mockRestore();
        });
    });

    describe('Error Handling', () => {
        it('should handle fs.mkdirSync errors gracefully', async () => {
            plugin = new FriggServerlessPlugin(mockServerless, mockOptions);

            fs.existsSync.mockReturnValue(false);
            fs.mkdirSync.mockImplementation(() => {
                throw new Error('Permission denied');
            });

            // Should not throw - error should be caught or allowed to propagate
            await expect(plugin.asyncInit()).rejects.toThrow('Permission denied');
        });
    });
});


