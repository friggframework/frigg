/**
 * Tests for EnvironmentValidator Adapter
 *
 * Tests environment variable validation and AWS credentials validation using mocked AWS SDK v3 clients.
 * Following TDD principles - tests written first.
 */

// Mock AWS SDK v3 - must be before any requires
const mockSend = jest.fn();
const mockSTSClient = jest.fn();
const mockGetCallerIdentityCommand = jest.fn();

jest.mock('@aws-sdk/client-sts', () => ({
    STSClient: mockSTSClient,
    GetCallerIdentityCommand: mockGetCallerIdentityCommand,
}));

const {
    setTestEnvironmentVariables,
    cleanupTestEnvironmentVariables,
} = require('../../helpers/test-utils');

describe('EnvironmentValidator', () => {
    let validator;
    let EnvironmentValidator;
    let testVarNames;

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();
        mockSend.mockClear();
        mockSTSClient.mockClear();
        mockGetCallerIdentityCommand.mockClear();

        // Configure the STSClient mock to return an object with send method
        mockSTSClient.mockImplementation(() => ({
            send: mockSend,
        }));

        // Mock the Command constructor to just return its input
        mockGetCallerIdentityCommand.mockImplementation((input) => ({ input }));

        // Require the module after mocks are set up
        ({ EnvironmentValidator } = require('../../../infrastructure/adapters/EnvironmentValidator'));

        validator = new EnvironmentValidator({ region: 'us-east-1' });

        // Clean up any existing test variables
        testVarNames = [];
    });

    afterEach(() => {
        cleanupTestEnvironmentVariables(testVarNames);
    });

    describe('constructor', () => {
        it('should create instance with default region', () => {
            const instance = new EnvironmentValidator();
            expect(instance).toBeInstanceOf(EnvironmentValidator);
        });

        it('should create instance with custom region', () => {
            const instance = new EnvironmentValidator({ region: 'eu-west-1' });
            expect(instance).toBeInstanceOf(EnvironmentValidator);
        });

        it('should lazy-load STS client', () => {
            mockSTSClient.mockClear();

            const instance = new EnvironmentValidator({ region: 'us-east-1' });

            // Client should not be created until first use
            expect(mockSTSClient).not.toHaveBeenCalled();
        });
    });

    describe('validateEnvironmentVariables', () => {
        describe('all required variables present', () => {
            it('should return success when all required environment variables are present', async () => {
                testVarNames = setTestEnvironmentVariables({
                    AWS_REGION: 'us-east-1',
                    STAGE: 'test',
                    DB_URI: 'mongodb://localhost:27017/test',
                });

                const appDefinition = {
                    name: 'test-app',
                    environment: {
                        AWS_REGION: true,
                        STAGE: true,
                        DB_URI: true,
                    },
                };

                const result = await validator.validateEnvironmentVariables(appDefinition);

                expect(result.valid).toBe(true);
                expect(result.errors).toEqual([]);
                expect(result.metadata.required.present).toEqual(['AWS_REGION', 'STAGE', 'DB_URI']);
                expect(result.metadata.required.missing).toEqual([]);
            });

            it('should return success with metadata about present variables', async () => {
                testVarNames = setTestEnvironmentVariables({
                    API_KEY: 'test-key',
                    DATABASE_URL: 'postgres://localhost/test',
                });

                const appDefinition = {
                    name: 'test-app',
                    environment: {
                        API_KEY: true,
                        DATABASE_URL: true,
                    },
                };

                const result = await validator.validateEnvironmentVariables(appDefinition);

                expect(result.valid).toBe(true);
                expect(result.metadata.required.present).toContain('API_KEY');
                expect(result.metadata.required.present).toContain('DATABASE_URL');
            });
        });

        describe('required variables missing', () => {
            it('should return failure when required environment variables are missing', async () => {
                // Set only AWS_REGION, ensure STAGE and DB_URI are not set
                process.env.AWS_REGION = 'us-east-1';
                delete process.env.STAGE;
                delete process.env.DB_URI;
                testVarNames = ['AWS_REGION'];

                const appDefinition = {
                    name: 'test-app',
                    environment: {
                        AWS_REGION: true,
                        STAGE: true,
                        DB_URI: true,
                    },
                };

                const result = await validator.validateEnvironmentVariables(appDefinition);

                expect(result.valid).toBe(false);
                expect(result.errors).toContain('Missing required environment variable: STAGE');
                expect(result.errors).toContain('Missing required environment variable: DB_URI');
                expect(result.metadata.required.present).toEqual(['AWS_REGION']);
                expect(result.metadata.required.missing).toEqual(['STAGE', 'DB_URI']);
            });

            it('should list all missing required variables in errors', async () => {
                const appDefinition = {
                    name: 'test-app',
                    environment: {
                        VAR1: true,
                        VAR2: true,
                        VAR3: true,
                    },
                };

                const result = await validator.validateEnvironmentVariables(appDefinition);

                expect(result.valid).toBe(false);
                expect(result.errors).toHaveLength(3);
                expect(result.errors).toContain('Missing required environment variable: VAR1');
                expect(result.errors).toContain('Missing required environment variable: VAR2');
                expect(result.errors).toContain('Missing required environment variable: VAR3');
            });
        });

        describe('optional variables', () => {
            it('should handle optional variables when present', async () => {
                testVarNames = setTestEnvironmentVariables({
                    REQUIRED_VAR: 'required',
                    OPTIONAL_VAR: 'optional',
                });

                const appDefinition = {
                    name: 'test-app',
                    environment: {
                        REQUIRED_VAR: true,
                        OPTIONAL_VAR: { required: false },
                    },
                };

                const result = await validator.validateEnvironmentVariables(appDefinition);

                expect(result.valid).toBe(true);
                expect(result.errors).toEqual([]);
                expect(result.warnings).toEqual([]);
                expect(result.metadata.required.present).toEqual(['REQUIRED_VAR']);
                expect(result.metadata.optional.present).toEqual(['OPTIONAL_VAR']);
                expect(result.metadata.optional.missing).toEqual([]);
            });

            it('should create warnings when optional variables are missing', async () => {
                testVarNames = setTestEnvironmentVariables({
                    REQUIRED_VAR: 'required',
                });

                const appDefinition = {
                    name: 'test-app',
                    environment: {
                        REQUIRED_VAR: true,
                        OPTIONAL_VAR: { required: false },
                        ANOTHER_OPTIONAL: { required: false },
                    },
                };

                const result = await validator.validateEnvironmentVariables(appDefinition);

                expect(result.valid).toBe(true);
                expect(result.errors).toEqual([]);
                expect(result.warnings).toContain('Optional environment variable not set: OPTIONAL_VAR');
                expect(result.warnings).toContain('Optional environment variable not set: ANOTHER_OPTIONAL');
                expect(result.metadata.optional.missing).toEqual(['OPTIONAL_VAR', 'ANOTHER_OPTIONAL']);
            });

            it('should not fail validation when optional variables are missing', async () => {
                testVarNames = setTestEnvironmentVariables({
                    REQUIRED_VAR: 'required',
                });

                const appDefinition = {
                    name: 'test-app',
                    environment: {
                        REQUIRED_VAR: true,
                        OPTIONAL_VAR: { required: false },
                    },
                };

                const result = await validator.validateEnvironmentVariables(appDefinition);

                expect(result.valid).toBe(true);
                expect(result.errors).toEqual([]);
            });
        });

        describe('no environment variables defined', () => {
            it('should return success when no environment variables are defined', async () => {
                const appDefinition = {
                    name: 'test-app',
                };

                const result = await validator.validateEnvironmentVariables(appDefinition);

                expect(result.valid).toBe(true);
                expect(result.errors).toEqual([]);
                expect(result.warnings).toEqual([]);
                expect(result.metadata.required.present).toEqual([]);
                expect(result.metadata.required.missing).toEqual([]);
            });

            it('should return success when environment is empty object', async () => {
                const appDefinition = {
                    name: 'test-app',
                    environment: {},
                };

                const result = await validator.validateEnvironmentVariables(appDefinition);

                expect(result.valid).toBe(true);
                expect(result.errors).toEqual([]);
            });
        });

        describe('edge cases', () => {
            it('should handle empty string values as present', async () => {
                testVarNames = setTestEnvironmentVariables({
                    EMPTY_VAR: '',
                });

                const appDefinition = {
                    name: 'test-app',
                    environment: {
                        EMPTY_VAR: true,
                    },
                };

                const result = await validator.validateEnvironmentVariables(appDefinition);

                expect(result.valid).toBe(true);
                expect(result.metadata.required.present).toContain('EMPTY_VAR');
            });

            it('should handle undefined app definition', async () => {
                const result = await validator.validateEnvironmentVariables(undefined);

                expect(result.valid).toBe(true);
                expect(result.errors).toEqual([]);
            });

            it('should handle null app definition', async () => {
                const result = await validator.validateEnvironmentVariables(null);

                expect(result.valid).toBe(true);
                expect(result.errors).toEqual([]);
            });

            it('should handle mixed required and optional variables', async () => {
                testVarNames = setTestEnvironmentVariables({
                    REQ1: 'value1',
                    REQ2: 'value2',
                    OPT1: 'value3',
                });

                const appDefinition = {
                    name: 'test-app',
                    environment: {
                        REQ1: true,
                        REQ2: true,
                        OPT1: { required: false },
                        OPT2: { required: false },
                    },
                };

                const result = await validator.validateEnvironmentVariables(appDefinition);

                expect(result.valid).toBe(true);
                expect(result.errors).toEqual([]);
                expect(result.warnings).toContain('Optional environment variable not set: OPT2');
                expect(result.metadata.required.present).toEqual(['REQ1', 'REQ2']);
                expect(result.metadata.optional.present).toEqual(['OPT1']);
                expect(result.metadata.optional.missing).toEqual(['OPT2']);
            });
        });
    });

    describe('validateAwsCredentials', () => {
        describe('valid credentials', () => {
            it('should return success when AWS credentials are valid', async () => {
                mockSend.mockResolvedValue({
                    Account: '123456789012',
                    Arn: 'arn:aws:iam::123456789012:user/test-user',
                    UserId: 'AIDAI23EXAMPLE',
                });

                const result = await validator.validateAwsCredentials();

                expect(result.valid).toBe(true);
                expect(result.errors).toEqual([]);
                expect(result.metadata.accountId).toBe('123456789012');
                expect(result.metadata.region).toBe('us-east-1');
                expect(mockSend).toHaveBeenCalledTimes(1);
            });

            it('should return account details in metadata', async () => {
                mockSend.mockResolvedValue({
                    Account: '987654321098',
                    Arn: 'arn:aws:iam::987654321098:user/deploy-user',
                    UserId: 'AIDAI45EXAMPLE',
                });

                const customValidator = new EnvironmentValidator({ region: 'eu-west-1' });
                const result = await customValidator.validateAwsCredentials();

                expect(result.valid).toBe(true);
                expect(result.metadata.accountId).toBe('987654321098');
                expect(result.metadata.region).toBe('eu-west-1');
            });

            it('should lazy-load STS client on first use', async () => {
                mockSTSClient.mockClear();

                mockSend.mockResolvedValue({
                    Account: '123456789012',
                    Arn: 'arn:aws:iam::123456789012:user/test',
                    UserId: 'AIDAI23EXAMPLE',
                });

                const newValidator = new EnvironmentValidator({ region: 'us-east-1' });

                // Client not created yet
                expect(mockSTSClient).not.toHaveBeenCalled();

                await newValidator.validateAwsCredentials();

                // Client created on first call
                expect(mockSTSClient).toHaveBeenCalledWith({ region: 'us-east-1' });
            });
        });

        describe('invalid credentials', () => {
            it('should return failure when AWS credentials are invalid', async () => {
                const error = new Error('The security token included in the request is invalid');
                error.name = 'InvalidClientTokenId';
                mockSend.mockRejectedValue(error);

                const result = await validator.validateAwsCredentials();

                expect(result.valid).toBe(false);
                expect(result.errors).toContain('AWS credentials are invalid or expired');
                expect(result.metadata.accountId).toBeNull();
                expect(result.metadata.region).toBe('us-east-1');
            });

            it('should handle missing credentials error', async () => {
                const error = new Error('Missing credentials in config');
                error.name = 'CredentialsProviderError';
                mockSend.mockRejectedValue(error);

                const result = await validator.validateAwsCredentials();

                expect(result.valid).toBe(false);
                expect(result.errors).toContain('AWS credentials not found. Please configure AWS credentials.');
            });

            it('should handle expired credentials', async () => {
                const error = new Error('Token has expired');
                error.name = 'ExpiredTokenException';
                mockSend.mockRejectedValue(error);

                const result = await validator.validateAwsCredentials();

                expect(result.valid).toBe(false);
                expect(result.errors).toContain('AWS credentials are invalid or expired');
            });

            it('should handle access denied errors', async () => {
                const error = new Error('User is not authorized to perform: sts:GetCallerIdentity');
                error.name = 'AccessDeniedException';
                mockSend.mockRejectedValue(error);

                const result = await validator.validateAwsCredentials();

                expect(result.valid).toBe(false);
                expect(result.errors).toContain('Access denied. Check your AWS IAM permissions.');
            });
        });

        describe('STS API errors', () => {
            it('should handle network errors', async () => {
                const error = new Error('Network timeout');
                error.code = 'NetworkingError';
                mockSend.mockRejectedValue(error);

                const result = await validator.validateAwsCredentials();

                expect(result.valid).toBe(false);
                expect(result.errors).toContain('Network error connecting to AWS: Network timeout');
            });

            it('should handle throttling errors', async () => {
                const error = new Error('Rate exceeded');
                error.name = 'Throttling';
                mockSend.mockRejectedValue(error);

                const result = await validator.validateAwsCredentials();

                expect(result.valid).toBe(false);
                expect(result.errors).toContain('AWS API throttling error. Please retry later.');
            });

            it('should handle service unavailable errors', async () => {
                const error = new Error('Service unavailable');
                error.name = 'ServiceUnavailableException';
                mockSend.mockRejectedValue(error);

                const result = await validator.validateAwsCredentials();

                expect(result.valid).toBe(false);
                expect(result.errors).toContain('AWS service unavailable: Service unavailable');
            });

            it('should handle unknown errors gracefully', async () => {
                const error = new Error('Unknown error');
                mockSend.mockRejectedValue(error);

                const result = await validator.validateAwsCredentials();

                expect(result.valid).toBe(false);
                expect(result.errors).toContain('Failed to validate AWS credentials: Unknown error');
            });

            it('should preserve error stack traces', async () => {
                const error = new Error('Test error');
                error.stack = 'Error: Test error\n    at Test.it';
                mockSend.mockRejectedValue(error);

                try {
                    await validator.validateAwsCredentials();
                } catch (e) {
                    // Should not throw, but handle gracefully
                }

                const result = await validator.validateAwsCredentials();
                expect(result.valid).toBe(false);
            });
        });

        describe('GetCallerIdentity command', () => {
            it('should use GetCallerIdentityCommand correctly', async () => {
                mockSend.mockResolvedValue({
                    Account: '123456789012',
                    Arn: 'arn:aws:iam::123456789012:user/test',
                    UserId: 'AIDAI23EXAMPLE',
                });

                mockGetCallerIdentityCommand.mockClear();

                await validator.validateAwsCredentials();

                expect(mockGetCallerIdentityCommand).toHaveBeenCalledWith({});
            });
        });
    });

    describe('integration scenarios', () => {
        it('should validate both environment and AWS credentials successfully', async () => {
            // Set up environment variables
            testVarNames = setTestEnvironmentVariables({
                AWS_REGION: 'us-east-1',
                STAGE: 'production',
            });

            const appDefinition = {
                name: 'test-app',
                environment: {
                    AWS_REGION: true,
                    STAGE: true,
                },
            };

            // Mock successful AWS credentials
            mockSend.mockResolvedValue({
                Account: '123456789012',
                Arn: 'arn:aws:iam::123456789012:user/deploy',
                UserId: 'AIDAI23EXAMPLE',
            });

            const envResult = await validator.validateEnvironmentVariables(appDefinition);
            const awsResult = await validator.validateAwsCredentials();

            expect(envResult.valid).toBe(true);
            expect(awsResult.valid).toBe(true);
        });

        it('should handle validation failures in both checks', async () => {
            // Missing environment variables
            const appDefinition = {
                name: 'test-app',
                environment: {
                    REQUIRED_VAR: true,
                },
            };

            // Invalid AWS credentials
            const error = new Error('Invalid credentials');
            error.name = 'InvalidClientTokenId';
            mockSend.mockRejectedValue(error);

            const envResult = await validator.validateEnvironmentVariables(appDefinition);
            const awsResult = await validator.validateAwsCredentials();

            expect(envResult.valid).toBe(false);
            expect(envResult.errors).toContain('Missing required environment variable: REQUIRED_VAR');
            expect(awsResult.valid).toBe(false);
            expect(awsResult.errors).toContain('AWS credentials are invalid or expired');
        });

        it('should handle partial success scenarios', async () => {
            // Valid environment variables
            testVarNames = setTestEnvironmentVariables({
                STAGE: 'test',
            });

            const appDefinition = {
                name: 'test-app',
                environment: {
                    STAGE: true,
                },
            };

            // Invalid AWS credentials
            const error = new Error('Missing credentials');
            error.name = 'CredentialsProviderError';
            mockSend.mockRejectedValue(error);

            const envResult = await validator.validateEnvironmentVariables(appDefinition);
            const awsResult = await validator.validateAwsCredentials();

            expect(envResult.valid).toBe(true);
            expect(awsResult.valid).toBe(false);
        });

        it('should handle empty app with valid AWS credentials', async () => {
            mockSend.mockResolvedValue({
                Account: '123456789012',
                Arn: 'arn:aws:iam::123456789012:user/test',
                UserId: 'AIDAI23EXAMPLE',
            });

            const appDefinition = {
                name: 'minimal-app',
            };

            const envResult = await validator.validateEnvironmentVariables(appDefinition);
            const awsResult = await validator.validateAwsCredentials();

            expect(envResult.valid).toBe(true);
            expect(awsResult.valid).toBe(true);
        });
    });

    describe('ValidationResult value object usage', () => {
        it('should return ValidationResult instance for environment validation', async () => {
            testVarNames = setTestEnvironmentVariables({
                TEST_VAR: 'value',
            });

            const appDefinition = {
                environment: {
                    TEST_VAR: true,
                },
            };

            const result = await validator.validateEnvironmentVariables(appDefinition);

            expect(result).toHaveProperty('valid');
            expect(result).toHaveProperty('errors');
            expect(result).toHaveProperty('warnings');
            expect(result).toHaveProperty('metadata');
        });

        it('should return ValidationResult instance for AWS validation', async () => {
            mockSend.mockResolvedValue({
                Account: '123456789012',
                Arn: 'arn:aws:iam::123456789012:user/test',
                UserId: 'AIDAI23EXAMPLE',
            });

            const result = await validator.validateAwsCredentials();

            expect(result).toHaveProperty('valid');
            expect(result).toHaveProperty('errors');
            expect(result).toHaveProperty('warnings');
            expect(result).toHaveProperty('metadata');
        });
    });
});
