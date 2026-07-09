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

    it('includes the diagnostic reason and status code in the log line when present', async () => {
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        try {
            await integration.receiveNotification(
                { name: 'testmodule' },
                'CREDENTIAL_INVALIDATED',
                {
                    credentialId: 'cred-1',
                    moduleName: 'testmodule',
                    reason: 'Unauthorized',
                    statusCode: 401,
                }
            );
            expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('401'));
            expect(logSpy).toHaveBeenCalledWith(
                expect.stringContaining('Unauthorized')
            );
        } finally {
            logSpy.mockRestore();
        }
    });

    it('logs the plain message with no diagnostic suffix when none is provided', async () => {
        const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
        try {
            await integration.receiveNotification(
                { name: 'testmodule' },
                'CREDENTIAL_INVALIDATED',
                { credentialId: 'cred-1', moduleName: 'testmodule' }
            );
            expect(logSpy).toHaveBeenCalledWith(
                '[Frigg] Module testmodule reported invalid credentials for integration int-1 — marking ERROR'
            );
        } finally {
            logSpy.mockRestore();
        }
    });

    describe('CREDENTIAL_VALIDATED self-heal', () => {
        const validatedPayload = {
            credentialId: 'cred-1',
            moduleName: 'testmodule',
        };

        it('heals ERROR → ENABLED when a module reports CREDENTIAL_VALIDATED', async () => {
            integration.status = 'ERROR';

            await integration.receiveNotification(
                { name: 'testmodule' },
                'CREDENTIAL_VALIDATED',
                validatedPayload
            );

            expect(mockUpdateIntegrationStatus.execute).toHaveBeenCalledTimes(1);
            expect(mockUpdateIntegrationStatus.execute).toHaveBeenCalledWith(
                'int-1',
                'ENABLED'
            );
            expect(integration.status).toBe('ENABLED');
        });

        it('does nothing when the integration is already ENABLED', async () => {
            integration.status = 'ENABLED';

            await integration.receiveNotification(
                { name: 'testmodule' },
                'CREDENTIAL_VALIDATED',
                validatedPayload
            );

            expect(mockUpdateIntegrationStatus.execute).not.toHaveBeenCalled();
            expect(integration.status).toBe('ENABLED');
        });

        it('does not override NEEDS_CONFIG', async () => {
            integration.status = 'NEEDS_CONFIG';

            await integration.receiveNotification(
                { name: 'testmodule' },
                'CREDENTIAL_VALIDATED',
                validatedPayload
            );

            expect(mockUpdateIntegrationStatus.execute).not.toHaveBeenCalled();
            expect(integration.status).toBe('NEEDS_CONFIG');
        });

        it('does not override DISABLED', async () => {
            integration.status = 'DISABLED';

            await integration.receiveNotification(
                { name: 'testmodule' },
                'CREDENTIAL_VALIDATED',
                validatedPayload
            );

            expect(mockUpdateIntegrationStatus.execute).not.toHaveBeenCalled();
            expect(integration.status).toBe('DISABLED');
        });

        it('no-ops when the integration has no id yet', async () => {
            integration.id = undefined;
            integration.status = 'ERROR';

            await integration.receiveNotification(
                { name: 'testmodule' },
                'CREDENTIAL_VALIDATED',
                validatedPayload
            );

            expect(mockUpdateIntegrationStatus.execute).not.toHaveBeenCalled();
        });
    });
});
