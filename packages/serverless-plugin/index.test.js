const FriggServerlessPlugin = require('./index');

// Mock dependencies
jest.mock('aws-sdk');

describe('FriggServerlessPlugin', () => {
    let plugin;
    let mockServerless;
    let mockOptions;
    const originalEnv = process.env;

    beforeEach(() => {

        // Mock serverless object
        mockServerless = {
            cli: {
                log: jest.fn()
            },
            service: {
                provider: {
                    name: 'aws',
                    region: 'us-east-1'
                },
                plugins: [],
                custom: {},
                functions: {}
            },
            processedInput: {
                commands: []
            },
            getProvider: jest.fn(() => ({})),
            extendConfiguration: jest.fn()
        };

        mockOptions = {
            stage: 'test'
        };

        // Reset environment
        process.env = { ...originalEnv };

        jest.clearAllMocks();
        
        plugin = new FriggServerlessPlugin(mockServerless, mockOptions);
    });

    afterEach(() => {
        process.env = originalEnv;
    });

    describe('constructor', () => {
        it('should initialize plugin with correct hooks', () => {
            expect(plugin.serverless).toBe(mockServerless);
            expect(plugin.options).toBe(mockOptions);
            expect(plugin.hooks).toEqual({
                initialize: expect.any(Function),
                'before:package:initialize': expect.any(Function),
                'after:package:package': expect.any(Function),
                'before:deploy:deploy': expect.any(Function)
            });
        });

        it('should get AWS provider from serverless', () => {
            expect(mockServerless.getProvider).toHaveBeenCalledWith('aws');
        });
    });

    describe('beforePackageInitialize', () => {
        it('should log pre-package hook message', async () => {
            await plugin.beforePackageInitialize();

            expect(mockServerless.cli.log).toHaveBeenCalledWith('Frigg Serverless Plugin: Pre-package hook');
        });
    });


    describe('asyncInit (offline mode)', () => {
        beforeEach(() => {
            // Mock AWS SDK
            const mockSQS = {
                createQueue: jest.fn()
            };
            
            jest.doMock('aws-sdk', () => ({
                SQS: jest.fn(() => mockSQS),
                config: {
                    update: jest.fn()
                }
            }));

            mockServerless.service.custom = {
                TestQueue: 'test-queue-name',
                AnotherQueue: 'another-queue-name'
            };

            mockServerless.service.provider.environment = {
                TEST_QUEUE_URL: { Ref: 'TestQueue' },
                ANOTHER_QUEUE_URL: { Ref: 'AnotherQueue' },
                NORMAL_VAR: 'normal-value'
            };
        });

        it('should create queues in offline mode', async () => {
            mockServerless.processedInput.commands = ['offline'];
            
            const AWS = require('aws-sdk');
            const mockSQS = new AWS.SQS();
            mockSQS.createQueue.mockImplementation((params, callback) => {
                callback(null, { QueueUrl: `http://localhost:4566/000000000000/${params.QueueName}` });
            });

            await plugin.asyncInit();

            expect(AWS.config.update).toHaveBeenCalledWith({
                region: 'us-east-1',
                endpoint: 'localhost:4566'
            });

            expect(mockSQS.createQueue).toHaveBeenCalledWith(
                { QueueName: 'test-queue-name' },
                expect.any(Function)
            );

            expect(mockSQS.createQueue).toHaveBeenCalledWith(
                { QueueName: 'another-queue-name' },
                expect.any(Function)
            );

            expect(mockServerless.extendConfiguration).toHaveBeenCalled();
        });

        it('should skip queue creation in online mode', async () => {
            mockServerless.processedInput.commands = ['deploy'];

            await plugin.asyncInit();

            const AWS = require('aws-sdk');
            expect(AWS.config.update).not.toHaveBeenCalled();
        });

        it('should handle queue creation errors', async () => {
            mockServerless.processedInput.commands = ['offline'];
            
            const AWS = require('aws-sdk');
            const mockSQS = new AWS.SQS();
            mockSQS.createQueue.mockImplementation((params, callback) => {
                callback(new Error('Queue creation failed'));
            });

            await expect(plugin.asyncInit()).rejects.toThrow('Queue creation failed');
        });
    });

    describe('hook methods', () => {
        it('should have init method', () => {
            expect(plugin.init).toBeDefined();
            expect(typeof plugin.init).toBe('function');
        });

        it('should have afterPackage method', () => {
            expect(plugin.afterPackage).toBeDefined();
            expect(typeof plugin.afterPackage).toBe('function');
            
            // Test that it logs correctly
            const consoleSpy = jest.spyOn(console, 'log');
            plugin.afterPackage();
            expect(consoleSpy).toHaveBeenCalledWith('After package hook called');
            consoleSpy.mockRestore();
        });

        it('should have beforeDeploy method', () => {
            expect(plugin.beforeDeploy).toBeDefined();
            expect(typeof plugin.beforeDeploy).toBe('function');
            
            // Test that it logs correctly
            const consoleSpy = jest.spyOn(console, 'log');
            plugin.beforeDeploy();
            expect(consoleSpy).toHaveBeenCalledWith('Before deploy hook called');
            consoleSpy.mockRestore();
        });
    });

});