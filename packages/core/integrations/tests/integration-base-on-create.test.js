jest.mock('../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
}));

const { IntegrationBase } = require('../integration-base');

describe('IntegrationBase.onCreate (default)', () => {
    let integration;
    let mockUpdateIntegrationStatus;

    beforeEach(() => {
        integration = new IntegrationBase();
        integration.id = 'int-1';
        integration.status = 'PROCESSING';

        mockUpdateIntegrationStatus = {
            execute: jest.fn().mockResolvedValue(true),
        };
        integration.updateIntegrationStatus = mockUpdateIntegrationStatus;
    });

    it('persists ENABLED through the injected command', async () => {
        await integration.onCreate({ integrationId: 'int-1' });

        expect(mockUpdateIntegrationStatus.execute).toHaveBeenCalledWith(
            'int-1',
            'ENABLED'
        );
    });

    it('syncs the in-memory status field so callers reading it immediately after see ENABLED', async () => {
        await integration.onCreate({ integrationId: 'int-1' });

        expect(integration.status).toBe('ENABLED');
    });
});
