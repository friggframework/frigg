/**
 * Test utilities for VPC/KMS/SSM testing
 */

const { mockEnvironmentVariables, mockFallbackEnvironmentVariables } = require('../fixtures/mock-aws-resources');

/**
 * Set up environment variables for testing
 * @param {Object} envVars - Environment variables to set
 */
function setTestEnvironmentVariables(envVars = mockEnvironmentVariables) {
    Object.keys(envVars).forEach(key => {
        process.env[key] = envVars[key];
    });
}

/**
 * Clean up environment variables after testing
 * @param {Object} envVars - Environment variables to clean up
 */
function cleanupTestEnvironmentVariables(envVars = mockEnvironmentVariables) {
    Object.keys(envVars).forEach(key => {
        delete process.env[key];
    });
}

/**
 * Set up fallback environment variables for error testing
 */
function setFallbackEnvironmentVariables() {
    setTestEnvironmentVariables(mockFallbackEnvironmentVariables);
}

/**
 * Create a mock AWS SDK client send function
 * @param {Array} responses - Array of responses to return in order
 * @returns {Function} Mock send function
 */
function createMockSendFunction(responses) {
    let callCount = 0;
    return jest.fn().mockImplementation(() => {
        const response = responses[callCount] || responses[responses.length - 1];
        callCount++;
        return Promise.resolve(response);
    });
}

/**
 * Create a mock serverless object for plugin testing
 * @param {Object} serviceConfig - Serverless service configuration
 * @param {Array} commands - Commands in processedInput
 * @returns {Object} Mock serverless object
 */
function createMockServerless(serviceConfig = {}, commands = []) {
    return {
        cli: {
            log: jest.fn()
        },
        service: {
            provider: {
                name: 'aws',
                region: 'us-east-1',
                ...serviceConfig.provider
            },
            plugins: serviceConfig.plugins || [],
            custom: serviceConfig.custom || {},
            functions: serviceConfig.functions || {},
            ...serviceConfig
        },
        processedInput: {
            commands: commands
        },
        getProvider: jest.fn(() => ({})),
        extendConfiguration: jest.fn()
    };
}

/**
 * Verify that environment variables are set correctly
 * @param {Object} expectedVars - Expected environment variables
 */
function verifyEnvironmentVariables(expectedVars) {
    Object.keys(expectedVars).forEach(key => {
        expect(process.env[key]).toBe(expectedVars[key]);
    });
}

/**
 * Create a mock integration definition
 * @param {string} name - Integration name
 * @returns {Object} Mock integration
 */
function createMockIntegration(name = 'testIntegration') {
    return {
        Definition: {
            name: name
        }
    };
}

/**
 * Create a mock app definition with specified features
 * @param {Object} features - Features to enable (vpc, kms, ssm)
 * @param {Array} integrations - Integration definitions
 * @returns {Object} Mock app definition
 */
function createMockAppDefinition(features = {}, integrations = []) {
    const appDefinition = {
        name: 'test-app',
        integrations: integrations
    };

    if (features.vpc) {
        appDefinition.vpc = { enable: true };
    }

    if (features.kms) {
        appDefinition.encryption = { fieldLevelEncryptionMethod: 'kms' };
    }

    if (features.ssm) {
        appDefinition.ssm = { enable: true };
    }

    return appDefinition;
}

/**
 * Verify serverless configuration contains expected VPC settings
 * @param {Object} config - Serverless configuration
 */
function verifyVpcConfiguration(config) {
    expect(config.provider.vpc).toBe('${self:custom.vpc.${self:provider.stage}}');
    expect(config.custom.vpc).toEqual({
        '${self:provider.stage}': {
            securityGroupIds: ['${env:AWS_DISCOVERY_SECURITY_GROUP_ID}'],
            subnetIds: [
                '${env:AWS_DISCOVERY_SUBNET_ID_1}',
                '${env:AWS_DISCOVERY_SUBNET_ID_2}'
            ]
        }
    });
    expect(config.resources.Resources.VPCEndpointS3).toBeDefined();
}

/**
 * Verify serverless configuration contains expected KMS settings
 * @param {Object} config - Serverless configuration
 */
function verifyKmsConfiguration(config) {
    expect(config.plugins).toContain('serverless-kms-grants');
    expect(config.provider.environment.KMS_KEY_ARN).toBe('${self:custom.kmsGrants.kmsKeyId}');
    expect(config.custom.kmsGrants).toEqual({
        kmsKeyId: '${env:AWS_DISCOVERY_KMS_KEY_ID}'
    });

    // Verify KMS IAM permissions
    const kmsPermission = config.provider.iamRoleStatements.find(
        statement => statement.Action.includes('kms:GenerateDataKey')
    );
    expect(kmsPermission).toBeDefined();
}

/**
 * Verify serverless configuration contains expected SSM settings
 * @param {Object} config - Serverless configuration
 */
function verifySsmConfiguration(config) {
    expect(config.provider.layers).toEqual([
        'arn:aws:lambda:${self:provider.region}:177933569100:layer:AWS-Parameters-and-Secrets-Lambda-Extension:11'
    ]);
    expect(config.provider.environment.SSM_PARAMETER_PREFIX).toBe('/${self:service}/${self:provider.stage}');

    // Verify SSM IAM permissions
    const ssmPermission = config.provider.iamRoleStatements.find(
        statement => statement.Action.includes('ssm:GetParameter')
    );
    expect(ssmPermission).toBeDefined();
}

/**
 * Verify integration-specific resources are created
 * @param {Object} config - Serverless configuration
 * @param {string} integrationName - Name of the integration
 */
function verifyIntegrationConfiguration(config, integrationName) {
    const capitalizedName = integrationName.charAt(0).toUpperCase() + integrationName.slice(1);
    
    // Verify integration function
    expect(config.functions[integrationName]).toBeDefined();
    
    // Verify queue worker function
    expect(config.functions[`${integrationName}QueueWorker`]).toBeDefined();
    
    // Verify SQS queue resource
    expect(config.resources.Resources[`${capitalizedName}Queue`]).toBeDefined();
    
    // Verify environment variable
    expect(config.provider.environment[`${integrationName.toUpperCase()}_QUEUE_URL`]).toBeDefined();
}

/**
 * Wait for async operations to complete
 * @param {number} ms - Milliseconds to wait
 */
function wait(ms = 0) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Capture console output for testing
 */
function captureConsoleOutput() {
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;
    
    const logs = [];
    const errors = [];
    const warnings = [];
    
    console.log = (...args) => {
        logs.push(args.join(' '));
    };
    
    console.error = (...args) => {
        errors.push(args.join(' '));
    };
    
    console.warn = (...args) => {
        warnings.push(args.join(' '));
    };
    
    return {
        logs,
        errors,
        warnings,
        restore: () => {
            console.log = originalLog;
            console.error = originalError;
            console.warn = originalWarn;
        }
    };
}

/**
 * Mock process.argv for testing
 * @param {Array} argv - Arguments to set
 */
function mockProcessArgv(argv = ['node', 'test']) {
    const originalArgv = process.argv;
    jest.spyOn(process, 'argv', 'get').mockReturnValue(argv);
    
    return {
        restore: () => {
            process.argv = originalArgv;
        }
    };
}

module.exports = {
    setTestEnvironmentVariables,
    cleanupTestEnvironmentVariables,
    setFallbackEnvironmentVariables,
    createMockSendFunction,
    createMockServerless,
    verifyEnvironmentVariables,
    createMockIntegration,
    createMockAppDefinition,
    verifyVpcConfiguration,
    verifyKmsConfiguration,
    verifySsmConfiguration,
    verifyIntegrationConfiguration,
    wait,
    captureConsoleOutput,
    mockProcessArgv
};