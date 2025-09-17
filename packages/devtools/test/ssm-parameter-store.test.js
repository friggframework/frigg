const { describe, it, expect, beforeEach, afterEach } = require('@jest/globals');
const http = require('http');

// Mock http module
jest.mock('http');

describe('SSM Parameter Store Utility', () => {
    let SSMParameterStore;
    let ssmInstance;
    
    beforeEach(() => {
        // Clear module cache
        jest.resetModules();
        
        // Set up environment variables
        process.env.AWS_SESSION_TOKEN = 'test-token';
        process.env.PARAMETERS_SECRETS_EXTENSION_HTTP_PORT = '2773';
        process.env.SSM_PARAMETER_PREFIX = '/test-app/prod';
        
        // Import fresh instance
        SSMParameterStore = require('../utils/ssm-parameter-store').constructor;
        ssmInstance = new SSMParameterStore();
    });
    
    afterEach(() => {
        // Clean up environment
        delete process.env.AWS_SESSION_TOKEN;
        delete process.env.PARAMETERS_SECRETS_EXTENSION_HTTP_PORT;
        delete process.env.SSM_PARAMETER_PREFIX;
        jest.clearAllMocks();
    });
    
    describe('Constructor', () => {
        it('should initialize with default values', () => {
            expect(ssmInstance.extensionPort).toBe('2773');
            expect(ssmInstance.extensionHost).toBe('localhost');
            expect(ssmInstance.sessionToken).toBe('test-token');
            expect(ssmInstance.parameterPrefix).toBe('/test-app/prod');
            expect(ssmInstance.extensionAvailable).toBe(true);
        });
        
        it('should detect when extension is not available', () => {
            delete process.env.AWS_SESSION_TOKEN;
            const instance = new SSMParameterStore();
            expect(instance.extensionAvailable).toBe(false);
        });
    });
    
    describe('getParameter', () => {
        it('should construct correct parameter name with prefix', async () => {
            const mockRequest = {
                on: jest.fn(),
                end: jest.fn()
            };
            const mockResponse = {
                on: jest.fn((event, callback) => {
                    if (event === 'data') {
                        callback('{"Parameter":{"Value":"test-value"}}');
                    } else if (event === 'end') {
                        callback();
                    }
                }),
                statusCode: 200
            };
            
            http.request.mockImplementation((options, callback) => {
                expect(options.path).toContain('/test-app/prod/database/url');
                callback(mockResponse);
                return mockRequest;
            });
            
            const value = await ssmInstance.getParameter('database/url');
            expect(value).toBe('test-value');
        });
        
        it('should use full name when useFullName is true', async () => {
            const mockRequest = {
                on: jest.fn(),
                end: jest.fn()
            };
            const mockResponse = {
                on: jest.fn((event, callback) => {
                    if (event === 'data') {
                        callback('{"Parameter":{"Value":"test-value"}}');
                    } else if (event === 'end') {
                        callback();
                    }
                }),
                statusCode: 200
            };
            
            http.request.mockImplementation((options, callback) => {
                expect(options.path).toContain('/custom/path/param');
                callback(mockResponse);
                return mockRequest;
            });
            
            const value = await ssmInstance.getParameter('/custom/path/param', { useFullName: true });
            expect(value).toBe('test-value');
        });
        
        it('should handle decryption parameter', async () => {
            const mockRequest = {
                on: jest.fn(),
                end: jest.fn()
            };
            const mockResponse = {
                on: jest.fn((event, callback) => {
                    if (event === 'data') {
                        callback('{"Parameter":{"Value":"decrypted-value"}}');
                    } else if (event === 'end') {
                        callback();
                    }
                }),
                statusCode: 200
            };
            
            http.request.mockImplementation((options, callback) => {
                expect(options.path).toContain('withDecryption=true');
                callback(mockResponse);
                return mockRequest;
            });
            
            const value = await ssmInstance.getParameter('secret-param', { withDecryption: true });
            expect(value).toBe('decrypted-value');
        });
        
        it('should handle errors from the extension', async () => {
            const mockRequest = {
                on: jest.fn(),
                end: jest.fn()
            };
            const mockResponse = {
                on: jest.fn((event, callback) => {
                    if (event === 'data') {
                        callback('{"message":"Parameter not found"}');
                    } else if (event === 'end') {
                        callback();
                    }
                }),
                statusCode: 404
            };
            
            http.request.mockImplementation((options, callback) => {
                callback(mockResponse);
                return mockRequest;
            });
            
            await expect(ssmInstance.getParameter('non-existent')).rejects.toThrow('Failed to get parameter');
        });
    });
    
    describe('getParametersByPath', () => {
        it('should retrieve multiple parameters by path', async () => {
            const mockRequest = {
                on: jest.fn(),
                end: jest.fn()
            };
            const mockResponse = {
                on: jest.fn((event, callback) => {
                    if (event === 'data') {
                        callback(JSON.stringify({
                            Parameters: [
                                { Name: '/test-app/prod/api-keys/salesforce', Value: 'sf-key' },
                                { Name: '/test-app/prod/api-keys/hubspot', Value: 'hs-key' }
                            ]
                        }));
                    } else if (event === 'end') {
                        callback();
                    }
                }),
                statusCode: 200
            };
            
            http.request.mockImplementation((options, callback) => {
                expect(options.path).toContain('path=%2Ftest-app%2Fprod%2Fapi-keys');
                expect(options.path).toContain('recursive=true');
                callback(mockResponse);
                return mockRequest;
            });
            
            const parameters = await ssmInstance.getParametersByPath('api-keys');
            expect(parameters).toEqual({
                'api-keys/salesforce': 'sf-key',
                'api-keys/hubspot': 'hs-key'
            });
        });
    });
    
    describe('loadAsEnvironmentVariables', () => {
        it('should load parameters as environment variables', async () => {
            const mockRequest = {
                on: jest.fn(),
                end: jest.fn()
            };
            const mockResponse = {
                on: jest.fn((event, callback) => {
                    if (event === 'data') {
                        callback(JSON.stringify({
                            Parameters: [
                                { Name: '/test-app/prod/database/url', Value: 'postgres://localhost' },
                                { Name: '/test-app/prod/api-keys/service', Value: 'service-key' }
                            ]
                        }));
                    } else if (event === 'end') {
                        callback();
                    }
                }),
                statusCode: 200
            };
            
            http.request.mockImplementation((options, callback) => {
                callback(mockResponse);
                return mockRequest;
            });
            
            const count = await ssmInstance.loadAsEnvironmentVariables('');
            
            expect(count).toBe(2);
            expect(process.env.DATABASE_URL).toBe('postgres://localhost');
            expect(process.env.API_KEYS_SERVICE).toBe('service-key');
            
            // Clean up
            delete process.env.DATABASE_URL;
            delete process.env.API_KEYS_SERVICE;
        });
    });
    
    describe('getSecret', () => {
        it('should retrieve and parse JSON secrets', async () => {
            const mockRequest = {
                on: jest.fn(),
                end: jest.fn()
            };
            const mockResponse = {
                on: jest.fn((event, callback) => {
                    if (event === 'data') {
                        callback('{"SecretString":"{\\"apiKey\\":\\"test-key\\",\\"apiSecret\\":\\"test-secret\\"}"}');
                    } else if (event === 'end') {
                        callback();
                    }
                }),
                statusCode: 200
            };
            
            http.request.mockImplementation((options, callback) => {
                expect(options.path).toContain('/secretsmanager/get');
                callback(mockResponse);
                return mockRequest;
            });
            
            const secret = await ssmInstance.getSecret('my-secret-arn');
            expect(secret).toEqual({
                apiKey: 'test-key',
                apiSecret: 'test-secret'
            });
        });
        
        it('should return plain string secrets as-is', async () => {
            const mockRequest = {
                on: jest.fn(),
                end: jest.fn()
            };
            const mockResponse = {
                on: jest.fn((event, callback) => {
                    if (event === 'data') {
                        callback('{"SecretString":"plain-secret-value"}');
                    } else if (event === 'end') {
                        callback();
                    }
                }),
                statusCode: 200
            };
            
            http.request.mockImplementation((options, callback) => {
                callback(mockResponse);
                return mockRequest;
            });
            
            const secret = await ssmInstance.getSecret('my-plain-secret');
            expect(secret).toBe('plain-secret-value');
        });
    });
    
    describe('SDK Fallback', () => {
        beforeEach(() => {
            delete process.env.AWS_SESSION_TOKEN;
            ssmInstance = new SSMParameterStore();
        });
        
        it('should use SDK when extension is not available', async () => {
            // Mock AWS SDK
            const mockSend = jest.fn().mockResolvedValue({
                Parameter: { Value: 'sdk-value' }
            });
            
            jest.doMock('@aws-sdk/client-ssm', () => ({
                SSMClient: jest.fn().mockImplementation(() => ({
                    send: mockSend
                })),
                GetParameterCommand: jest.fn()
            }));
            
            const value = await ssmInstance.getParameter('test-param');
            expect(value).toBe('sdk-value');
        });
    });
});

describe('SSM Handler Wrapper', () => {
    let withSSMParameters;
    let mockParameterStore;
    
    beforeEach(() => {
        jest.resetModules();
        
        // Mock the parameter store
        mockParameterStore = {
            loadAsEnvironmentVariables: jest.fn().mockResolvedValue(3),
            getSecret: jest.fn().mockResolvedValue({
                API_KEY: 'secret-key',
                API_SECRET: 'secret-value'
            })
        };
        
        jest.doMock('../utils/ssm-parameter-store', () => mockParameterStore);
        
        const wrapper = require('../handlers/ssm-handler-wrapper');
        withSSMParameters = wrapper.withSSMParameters;
    });
    
    afterEach(() => {
        jest.clearAllMocks();
    });
    
    it('should load parameters before handler execution', async () => {
        process.env.SSM_PARAMETER_PREFIX = '/test-app/prod';
        
        const handler = jest.fn().mockResolvedValue({ success: true });
        const wrapped = withSSMParameters(handler);
        
        const result = await wrapped({}, {});
        
        expect(mockParameterStore.loadAsEnvironmentVariables).toHaveBeenCalledWith('', {
            recursive: true,
            withDecryption: true
        });
        expect(handler).toHaveBeenCalled();
        expect(result).toEqual({ success: true });
        
        delete process.env.SSM_PARAMETER_PREFIX;
    });
    
    it('should load secrets when enabled', async () => {
        process.env.SSM_PARAMETER_PREFIX = '/test-app/prod';
        process.env.SECRET_ARN = 'arn:aws:secretsmanager:region:account:secret:name';
        
        const handler = jest.fn().mockResolvedValue({ success: true });
        const wrapped = withSSMParameters(handler, { loadSecrets: true });
        
        await wrapped({}, {});
        
        expect(mockParameterStore.getSecret).toHaveBeenCalledWith('arn:aws:secretsmanager:region:account:secret:name');
        expect(process.env.API_KEY).toBe('secret-key');
        expect(process.env.API_SECRET).toBe('secret-value');
        
        delete process.env.SSM_PARAMETER_PREFIX;
        delete process.env.SECRET_ARN;
        delete process.env.API_KEY;
        delete process.env.API_SECRET;
    });
    
    it('should continue on error when failOnError is false', async () => {
        process.env.SSM_PARAMETER_PREFIX = '/test-app/prod';
        mockParameterStore.loadAsEnvironmentVariables.mockRejectedValue(new Error('Load failed'));
        
        const handler = jest.fn().mockResolvedValue({ success: true });
        const wrapped = withSSMParameters(handler, { failOnError: false });
        
        const result = await wrapped({}, {});
        
        expect(handler).toHaveBeenCalled();
        expect(result).toEqual({ success: true });
        
        delete process.env.SSM_PARAMETER_PREFIX;
    });
    
    it('should fail when failOnError is true', async () => {
        process.env.SSM_PARAMETER_PREFIX = '/test-app/prod';
        mockParameterStore.loadAsEnvironmentVariables.mockRejectedValue(new Error('Load failed'));
        
        const handler = jest.fn().mockResolvedValue({ success: true });
        const wrapped = withSSMParameters(handler, { failOnError: true });
        
        await expect(wrapped({}, {})).rejects.toThrow('Load failed');
        expect(handler).not.toHaveBeenCalled();
        
        delete process.env.SSM_PARAMETER_PREFIX;
    });
});