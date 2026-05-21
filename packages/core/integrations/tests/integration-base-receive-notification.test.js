jest.mock('../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
}));

const { IntegrationBase } = require('../integration-base');

describe('IntegrationBase.receiveNotification', () => {
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

    it('ignores unknown delegate strings', async () => {
        await integration.receiveNotification(
            { name: 'testmodule' },
            'SOMETHING_ELSE',
            {}
        );
        expect(mockUpdateIntegrationStatus.execute).not.toHaveBeenCalled();
        expect(integration.status).toBe('ENABLED');
    });

    it('no-ops when the integration has no id yet (not hydrated)', async () => {
        integration.id = undefined;
        await integration.receiveNotification(
            { name: 'testmodule' },
            'CREDENTIAL_INVALIDATED',
            { credentialId: 'cred-1' }
        );
        expect(mockUpdateIntegrationStatus.execute).not.toHaveBeenCalled();
    });

    it('flips the integration to ERROR when a module reports CREDENTIAL_INVALIDATED', async () => {
        const mockNotifier = { name: 'testmodule' };

        await integration.receiveNotification(
            mockNotifier,
            'CREDENTIAL_INVALIDATED',
            { credentialId: 'cred-1', moduleName: 'testmodule' }
        );

        expect(mockUpdateIntegrationStatus.execute).toHaveBeenCalledTimes(1);
        expect(mockUpdateIntegrationStatus.execute).toHaveBeenCalledWith(
            'int-1',
            'ERROR'
        );
        expect(integration.status).toBe('ERROR');
    });

    describe('CREDENTIAL_VALIDATED (self-heal after a refresh succeeds)', () => {
        it('clears ERROR back to ENABLED when a module reports valid credentials', async () => {
            integration.status = 'ERROR';

            await integration.receiveNotification(
                { name: 'testmodule' },
                'CREDENTIAL_VALIDATED',
                { credentialId: 'cred-1', moduleName: 'testmodule' }
            );

            expect(mockUpdateIntegrationStatus.execute).toHaveBeenCalledTimes(1);
            expect(mockUpdateIntegrationStatus.execute).toHaveBeenCalledWith(
                'int-1',
                'ENABLED'
            );
            expect(integration.status).toBe('ENABLED');
        });

        it('is a no-op when the integration is already ENABLED', async () => {
            integration.status = 'ENABLED';

            await integration.receiveNotification(
                { name: 'testmodule' },
                'CREDENTIAL_VALIDATED',
                { credentialId: 'cred-1', moduleName: 'testmodule' }
            );

            expect(mockUpdateIntegrationStatus.execute).not.toHaveBeenCalled();
            expect(integration.status).toBe('ENABLED');
        });

        it('does NOT clobber other non-ERROR states (e.g. NEEDS_CONFIG, DISABLED)', async () => {
            for (const status of ['NEEDS_CONFIG', 'DISABLED', 'PROCESSING']) {
                mockUpdateIntegrationStatus.execute.mockClear();
                integration.status = status;
                await integration.receiveNotification(
                    { name: 'testmodule' },
                    'CREDENTIAL_VALIDATED',
                    { credentialId: 'cred-1', moduleName: 'testmodule' }
                );
                expect(mockUpdateIntegrationStatus.execute).not.toHaveBeenCalled();
                expect(integration.status).toBe(status);
            }
        });

        it('no-ops when the integration has no id yet (not hydrated)', async () => {
            integration.id = undefined;
            integration.status = 'ERROR';

            await integration.receiveNotification(
                { name: 'testmodule' },
                'CREDENTIAL_VALIDATED',
                { credentialId: 'cred-1', moduleName: 'testmodule' }
            );

            expect(mockUpdateIntegrationStatus.execute).not.toHaveBeenCalled();
            expect(integration.status).toBe('ERROR');
        });
    });
});
