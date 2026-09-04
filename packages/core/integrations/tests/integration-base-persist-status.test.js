jest.mock('../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
}));

const { IntegrationBase } = require('../integration-base');

describe('IntegrationBase.persistStatus', () => {
    let integration;
    let mockUpdateIntegrationStatus;

    beforeEach(() => {
        integration = new IntegrationBase();
        integration.id = 'int-1';
        integration.status = 'ENABLED';

        mockUpdateIntegrationStatus = {
            execute: jest.fn().mockResolvedValue(true),
        };
        integration.updateIntegrationStatus = mockUpdateIntegrationStatus;
    });

    it('persists the new status through the injected command', async () => {
        await integration.persistStatus('ERROR');

        expect(mockUpdateIntegrationStatus.execute).toHaveBeenCalledWith(
            'int-1',
            'ERROR'
        );
    });

    it('syncs the in-memory status field', async () => {
        await integration.persistStatus('ERROR');

        expect(integration.status).toBe('ERROR');
    });

    it('leaves the in-memory status unchanged when the persist fails', async () => {
        mockUpdateIntegrationStatus.execute.mockRejectedValue(
            new Error('db down')
        );

        await expect(integration.persistStatus('ERROR')).rejects.toThrow(
            'db down'
        );
        expect(integration.status).toBe('ENABLED');
    });
});
