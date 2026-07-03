jest.mock('../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
}));

const { IntegrationBase } = require('../integration-base');

describe('IntegrationBase.reconcileAuthStatus', () => {
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

    it('marks ERROR when auth did not pass', async () => {
        await integration.reconcileAuthStatus(false);

        expect(mockUpdateIntegrationStatus.execute).toHaveBeenCalledWith(
            'int-1',
            'ERROR'
        );
        expect(integration.status).toBe('ERROR');
    });

    it('heals ERROR to ENABLED when auth passed', async () => {
        integration.status = 'ERROR';

        await integration.reconcileAuthStatus(true);

        expect(mockUpdateIntegrationStatus.execute).toHaveBeenCalledWith(
            'int-1',
            'ENABLED'
        );
        expect(integration.status).toBe('ENABLED');
    });

    it('does nothing when auth passed and status is already ENABLED', async () => {
        await integration.reconcileAuthStatus(true);

        expect(mockUpdateIntegrationStatus.execute).not.toHaveBeenCalled();
        expect(integration.status).toBe('ENABLED');
    });

    it.each(['NEEDS_CONFIG', 'DISABLED', 'PROCESSING'])(
        'leaves %s untouched when auth passed (only the ERROR axis is reconciled)',
        async (status) => {
            integration.status = status;

            await integration.reconcileAuthStatus(true);

            expect(mockUpdateIntegrationStatus.execute).not.toHaveBeenCalled();
            expect(integration.status).toBe(status);
        }
    );

    it('leaves PROCESSING untouched when auth fails, instead of marking ERROR', async () => {
        // A row that never completed creation is PROCESSING, not ERROR,
        // specifically so this method's own heal (authPassed && ERROR ->
        // ENABLED) can never fire for it. Demoting PROCESSING to ERROR here
        // would reopen that exact hole on the next retry with valid auth:
        // ERROR heals to ENABLED even though setup never ran.
        integration.status = 'PROCESSING';

        await integration.reconcileAuthStatus(false);

        expect(mockUpdateIntegrationStatus.execute).not.toHaveBeenCalled();
        expect(integration.status).toBe('PROCESSING');
    });
});
