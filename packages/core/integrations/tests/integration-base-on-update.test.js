jest.mock('../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
}));

const { IntegrationBase } = require('../integration-base');

describe('IntegrationBase.onUpdate (default lifecycle)', () => {
    let integration;
    let mockUpdateIntegrationStatus;
    let mockPatchIntegrationConfig;

    beforeEach(() => {
        integration = new IntegrationBase();
        integration.id = 'int-1';
        integration.status = 'NEEDS_CONFIG';
        integration.config = {};

        mockUpdateIntegrationStatus = {
            execute: jest.fn().mockResolvedValue(true),
        };
        mockPatchIntegrationConfig = {
            execute: jest.fn(async (id, patch) => {
                integration.config = { ...integration.config, ...patch };
                return { config: integration.config };
            }),
        };
        integration.updateIntegrationStatus = mockUpdateIntegrationStatus;
        integration.updateIntegrationMessages = {
            execute: jest.fn().mockResolvedValue(true),
        };
        integration.patchIntegrationConfig = mockPatchIntegrationConfig;
    });

    it('persists the submitted config before re-validating', async () => {
        integration.getConfigOptions = jest
            .fn()
            .mockResolvedValue({ jsonSchema: {}, uiSchema: {} });

        await integration.onUpdate({ config: { apiKey: 'abc' } });

        expect(mockPatchIntegrationConfig.execute).toHaveBeenCalledWith(
            'int-1',
            { apiKey: 'abc' }
        );
        expect(integration.config).toEqual({ apiKey: 'abc' });
    });

    it('moves NEEDS_CONFIG to ENABLED once the submitted config satisfies the required fields', async () => {
        integration.getConfigOptions = jest.fn().mockResolvedValue({
            jsonSchema: {
                required: ['apiKey'],
                properties: { apiKey: { title: 'API Key' } },
            },
            uiSchema: {},
        });

        await integration.onUpdate({ config: { apiKey: 'abc' } });

        expect(mockUpdateIntegrationStatus.execute).toHaveBeenCalledWith(
            'int-1',
            'ENABLED'
        );
        expect(integration.status).toBe('ENABLED');
    });

    it('stays NEEDS_CONFIG when the submitted config still misses a required field', async () => {
        integration.getConfigOptions = jest.fn().mockResolvedValue({
            jsonSchema: {
                required: ['apiKey', 'siteId'],
                properties: {
                    apiKey: { title: 'API Key' },
                    siteId: { title: 'Site ID' },
                },
            },
            uiSchema: {},
        });

        await integration.onUpdate({ config: { apiKey: 'abc' } });

        expect(mockUpdateIntegrationStatus.execute).not.toHaveBeenCalledWith(
            'int-1',
            'ENABLED'
        );
        expect(integration.status).toBe('NEEDS_CONFIG');
    });

    it('does not touch status for a healthy integration with nothing missing', async () => {
        integration.status = 'ENABLED';
        integration.getConfigOptions = jest
            .fn()
            .mockResolvedValue({ jsonSchema: {}, uiSchema: {} });

        await integration.onUpdate({ config: { apiKey: 'abc' } });

        expect(mockUpdateIntegrationStatus.execute).not.toHaveBeenCalled();
        expect(integration.status).toBe('ENABLED');
    });

    it('does not auto-heal a DISABLED integration just because config was edited', async () => {
        integration.status = 'DISABLED';
        integration.getConfigOptions = jest
            .fn()
            .mockResolvedValue({ jsonSchema: {}, uiSchema: {} });

        await integration.onUpdate({ config: { apiKey: 'abc' } });

        expect(mockUpdateIntegrationStatus.execute).not.toHaveBeenCalled();
        expect(integration.status).toBe('DISABLED');
    });

    it('skips the config write when no config is submitted', async () => {
        integration.getConfigOptions = jest
            .fn()
            .mockResolvedValue({ jsonSchema: {}, uiSchema: {} });

        await integration.onUpdate({});

        expect(mockPatchIntegrationConfig.execute).not.toHaveBeenCalled();
    });
});
