jest.mock('../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
}));

const { IntegrationBase } = require('../integration-base');

describe('IntegrationBase.validateConfig', () => {
    let integration;
    let mockUpdateIntegrationStatus;
    let mockUpdateIntegrationMessages;

    beforeEach(() => {
        integration = new IntegrationBase();
        integration.id = 'int-1';
        integration.status = 'IN_CREATION';
        integration.config = {};

        mockUpdateIntegrationStatus = {
            execute: jest.fn().mockResolvedValue(true),
        };
        mockUpdateIntegrationMessages = {
            execute: jest.fn().mockResolvedValue(true),
        };
        integration.updateIntegrationStatus = mockUpdateIntegrationStatus;
        integration.updateIntegrationMessages = mockUpdateIntegrationMessages;
    });

    it('enables an IN_CREATION integration when no fields are required', async () => {
        integration.getConfigOptions = jest.fn().mockResolvedValue({
            jsonSchema: {
                type: 'object',
                properties: { foo: { type: 'string' } },
            },
            uiSchema: {},
        });

        const needsConfig = await integration.validateConfig();

        expect(needsConfig).toBe(false);
        expect(mockUpdateIntegrationMessages.execute).not.toHaveBeenCalled();
        expect(mockUpdateIntegrationStatus.execute).toHaveBeenCalledWith(
            'int-1',
            'ENABLED'
        );
        expect(integration.status).toBe('ENABLED');
    });

    it('enables an IN_CREATION integration when every required field is present', async () => {
        integration.config = { apiKey: 'abc' };
        integration.getConfigOptions = jest.fn().mockResolvedValue({
            jsonSchema: {
                type: 'object',
                required: ['apiKey'],
                properties: { apiKey: { type: 'string', title: 'API Key' } },
            },
            uiSchema: {},
        });

        const needsConfig = await integration.validateConfig();

        expect(needsConfig).toBe(false);
        expect(mockUpdateIntegrationStatus.execute).toHaveBeenCalledWith(
            'int-1',
            'ENABLED'
        );
        expect(integration.status).toBe('ENABLED');
    });

    it('enables a NEEDS_CONFIG integration once nothing required is missing', async () => {
        integration.status = 'NEEDS_CONFIG';
        integration.config = { apiKey: 'abc' };
        integration.getConfigOptions = jest.fn().mockResolvedValue({
            jsonSchema: {
                type: 'object',
                required: ['apiKey'],
                properties: { apiKey: { type: 'string', title: 'API Key' } },
            },
            uiSchema: {},
        });

        const needsConfig = await integration.validateConfig();

        expect(needsConfig).toBe(false);
        expect(mockUpdateIntegrationStatus.execute).toHaveBeenCalledWith(
            'int-1',
            'ENABLED'
        );
        expect(integration.status).toBe('ENABLED');
    });

    it.each(['DISABLED', 'ERROR', 'IN_DELETION', 'ENABLED'])(
        'does not touch a %s integration when nothing is missing',
        async (status) => {
            integration.status = status;
            integration.getConfigOptions = jest.fn().mockResolvedValue({
                jsonSchema: { type: 'object', properties: {} },
                uiSchema: {},
            });

            const needsConfig = await integration.validateConfig();

            expect(needsConfig).toBe(false);
            expect(mockUpdateIntegrationStatus.execute).not.toHaveBeenCalled();
            expect(integration.status).toBe(status);
        }
    );

    it('moves to NEEDS_CONFIG and records a warning when a required field is missing', async () => {
        integration.config = {};
        integration.getConfigOptions = jest.fn().mockResolvedValue({
            jsonSchema: {
                type: 'object',
                required: ['apiKey'],
                properties: { apiKey: { type: 'string', title: 'API Key' } },
            },
            uiSchema: {},
        });

        const needsConfig = await integration.validateConfig();

        expect(needsConfig).toBe(true);
        expect(mockUpdateIntegrationStatus.execute).toHaveBeenCalledWith(
            'int-1',
            'NEEDS_CONFIG'
        );
        expect(integration.status).toBe('NEEDS_CONFIG');
        expect(mockUpdateIntegrationMessages.execute).toHaveBeenCalledWith(
            'int-1',
            'warnings',
            'Config Validation Error',
            'Missing required field of API Key',
            expect.any(Number)
        );
    });

    it('falls back to the property key when a required field has no title', async () => {
        integration.config = {};
        integration.getConfigOptions = jest.fn().mockResolvedValue({
            jsonSchema: { type: 'object', required: ['siteNumber'], properties: {} },
            uiSchema: {},
        });

        await integration.validateConfig();

        expect(mockUpdateIntegrationMessages.execute).toHaveBeenCalledWith(
            'int-1',
            'warnings',
            'Config Validation Error',
            'Missing required field of siteNumber',
            expect.any(Number)
        );
    });

    it('does not throw on the default {jsonSchema,uiSchema} config-options shape', async () => {
        // Regression: the old implementation did `for..of` over the options
        // object and threw "configOptions is not iterable".
        await expect(integration.validateConfig()).resolves.toBe(false);
    });
});
