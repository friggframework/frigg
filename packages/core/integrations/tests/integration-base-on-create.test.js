jest.mock('../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
}));

const { IntegrationBase } = require('../integration-base');

describe('IntegrationBase.onCreate (default lifecycle)', () => {
    let integration;
    let mockUpdateIntegrationStatus;

    beforeEach(() => {
        integration = new IntegrationBase();
        integration.id = 'int-1';
        integration.status = 'IN_CREATION';
        integration.config = {};

        mockUpdateIntegrationStatus = {
            execute: jest.fn().mockResolvedValue(true),
        };
        integration.updateIntegrationStatus = mockUpdateIntegrationStatus;
        integration.updateIntegrationMessages = {
            execute: jest.fn().mockResolvedValue(true),
        };
    });

    it('enables the integration when no config is needed', async () => {
        integration.getConfigOptions = jest
            .fn()
            .mockResolvedValue({ jsonSchema: {}, uiSchema: {} });

        await integration.onCreate();

        expect(mockUpdateIntegrationStatus.execute).toHaveBeenCalledWith(
            'int-1',
            'ENABLED'
        );
        expect(integration.status).toBe('ENABLED');
    });

    it('stays NEEDS_CONFIG (never ENABLED) when a required field is missing', async () => {
        integration.getConfigOptions = jest.fn().mockResolvedValue({
            jsonSchema: {
                required: ['apiKey'],
                properties: { apiKey: { title: 'API Key' } },
            },
            uiSchema: {},
        });

        await integration.onCreate();

        expect(mockUpdateIntegrationStatus.execute).toHaveBeenCalledWith(
            'int-1',
            'NEEDS_CONFIG'
        );
        expect(mockUpdateIntegrationStatus.execute).not.toHaveBeenCalledWith(
            'int-1',
            'ENABLED'
        );
        expect(integration.status).toBe('NEEDS_CONFIG');
    });

    it('leaves the row IN_CREATION (never ENABLED) when the hook throws', async () => {
        integration.getConfigOptions = jest
            .fn()
            .mockRejectedValue(new Error('boom'));

        await expect(integration.onCreate()).rejects.toThrow('boom');

        expect(mockUpdateIntegrationStatus.execute).not.toHaveBeenCalledWith(
            'int-1',
            'ENABLED'
        );
        expect(integration.status).toBe('IN_CREATION');
    });
});
