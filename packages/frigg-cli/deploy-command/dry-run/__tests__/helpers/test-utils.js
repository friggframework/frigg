/**
 * Dry-Run Test Utilities
 *
 * Common helper functions for testing dry-run components
 */

function createMockChangeSetCreator(responses = {}) {
    return {
        createChangeSet: jest.fn().mockResolvedValue(responses.create || {}),
        stackExists: jest.fn().mockResolvedValue(responses.exists !== undefined ? responses.exists : true),
        waitForChangeSet: jest.fn().mockResolvedValue(),
        getChangeSetDetails: jest.fn().mockResolvedValue(responses.details || {}),
        deleteChangeSet: jest.fn().mockResolvedValue(),
    };
}

function createMockEnvironmentValidator(responses = {}) {
    return {
        validateEnvironmentVariables: jest.fn().mockResolvedValue(
            responses.env || {
                valid: true,
                required: { present: [], missing: [] },
                optional: { present: [], missing: [] },
                errors: [],
                warnings: [],
            }
        ),
        validateAwsCredentials: jest.fn().mockResolvedValue(
            responses.aws || {
                valid: true,
                accountId: '123456789012',
                region: 'us-east-1',
                errors: [],
            }
        ),
    };
}

function createMockTemplateGenerator(responses = {}) {
    return {
        generateTemplate: jest.fn().mockResolvedValue(
            responses.template || {
                template: 'Resources: {}',
                summary: {
                    functions: [],
                    endpoints: [],
                    resources: {},
                },
            }
        ),
    };
}

function setTestEnvironmentVariables(vars = {}) {
    const defaults = {
        AWS_REGION: 'us-east-1',
        STAGE: 'test',
        DB_URI: 'mongodb://localhost:27017/test',
        ENCRYPTION_KEY: 'test-key',
    };

    const allVars = { ...defaults, ...vars };

    Object.keys(allVars).forEach((key) => {
        process.env[key] = allVars[key];
    });

    return Object.keys(allVars);
}

function cleanupTestEnvironmentVariables(varNames = []) {
    varNames.forEach((key) => {
        delete process.env[key];
    });
}

function createMockAppDefinition(overrides = {}) {
    return {
        name: 'test-app',
        provider: 'aws',
        region: 'us-east-1',
        runtime: 'nodejs20.x',
        environment: {
            AWS_REGION: true,
            STAGE: true,
        },
        ...overrides,
    };
}

function captureConsoleOutput() {
    const logs = [];
    const errors = [];
    const warns = [];

    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    console.log = (...args) => {
        logs.push(args.join(' '));
    };

    console.error = (...args) => {
        errors.push(args.join(' '));
    };

    console.warn = (...args) => {
        warns.push(args.join(' '));
    };

    return {
        logs,
        errors,
        warns,
        restore: () => {
            console.log = originalLog;
            console.error = originalError;
            console.warn = originalWarn;
        },
    };
}

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function createMockCloudFormationSend(responses = []) {
    let callIndex = 0;
    return jest.fn().mockImplementation(() => {
        const response = responses[callIndex] || responses[responses.length - 1];
        callIndex++;
        return Promise.resolve(response);
    });
}

module.exports = {
    createMockChangeSetCreator,
    createMockEnvironmentValidator,
    createMockTemplateGenerator,
    setTestEnvironmentVariables,
    cleanupTestEnvironmentVariables,
    createMockAppDefinition,
    captureConsoleOutput,
    wait,
    createMockCloudFormationSend,
};
