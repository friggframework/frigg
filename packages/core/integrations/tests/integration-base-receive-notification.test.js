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
    let mockUpdateIntegrationMessages;

    beforeEach(() => {
        integration = new IntegrationBase();
        integration.id = 'int-1';
        integration.status = 'ENABLED';

        mockUpdateIntegrationStatus = {
            execute: jest.fn().mockResolvedValue(true),
        };
        integration.updateIntegrationStatus = mockUpdateIntegrationStatus;

        mockUpdateIntegrationMessages = {
            execute: jest.fn().mockResolvedValue(true),
        };
        integration.updateIntegrationMessages = mockUpdateIntegrationMessages;
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

    describe('recorded diagnostic', () => {
        it('records an Authentication Error naming the module and status code', async () => {
            await integration.receiveNotification(
                { name: 'testmodule', getName: () => 'testmodule' },
                'CREDENTIAL_INVALIDATED',
                {
                    credentialId: 'cred-1',
                    moduleName: 'testmodule',
                    reason: 'Unauthorized',
                    statusCode: 401,
                }
            );

            expect(mockUpdateIntegrationMessages.execute).toHaveBeenCalledTimes(
                1
            );
            const [integrationId, messageType, title, body] =
                mockUpdateIntegrationMessages.execute.mock.calls[0];
            expect(integrationId).toBe('int-1');
            expect(messageType).toBe('errors');
            expect(title).toBe('Authentication Error');
            expect(body).toContain('testmodule');
            expect(body).toContain('401');
            expect(body).toContain('reconnect');
        });

        it('records the diagnostic before flipping status, so a failed flip still leaves a cause', async () => {
            const callOrder = [];
            mockUpdateIntegrationMessages.execute.mockImplementation(async () =>
                callOrder.push('message')
            );
            mockUpdateIntegrationStatus.execute.mockImplementation(async () =>
                callOrder.push('status')
            );

            await integration.receiveNotification(
                { name: 'testmodule' },
                'CREDENTIAL_INVALIDATED',
                { credentialId: 'cred-1', statusCode: 401 }
            );

            expect(callOrder).toEqual(['message', 'status']);
        });

        it('still flips to ERROR when recording the diagnostic fails', async () => {
            mockUpdateIntegrationMessages.execute.mockRejectedValue(
                new Error('db write failed')
            );
            const errorSpy = jest
                .spyOn(console, 'error')
                .mockImplementation(() => {});

            try {
                await integration.receiveNotification(
                    { name: 'testmodule' },
                    'CREDENTIAL_INVALIDATED',
                    { credentialId: 'cred-1', statusCode: 401 }
                );
            } finally {
                errorSpy.mockRestore();
            }

            expect(mockUpdateIntegrationStatus.execute).toHaveBeenCalledWith(
                'int-1',
                'ERROR'
            );
            expect(integration.status).toBe('ERROR');
        });

        it('keeps the request-echoing reason out of the persisted message', async () => {
            const fetchErrorMessage = [
                '-----------------------------------------------------',
                'An error ocurred while fetching an external resource.',
                '>>> Request Details >>>',
                'GET https://api.example.com/v1/users?type=CurrentUser',
                '{"headers":{"Authorization":"Bearer super-secret-token"}}',
            ].join('\n');

            await integration.receiveNotification(
                { name: 'testmodule' },
                'CREDENTIAL_INVALIDATED',
                {
                    credentialId: 'cred-1',
                    reason: fetchErrorMessage,
                    statusCode: 401,
                }
            );

            const [, , , body] =
                mockUpdateIntegrationMessages.execute.mock.calls[0];
            expect(body).not.toContain('Authorization');
            expect(body).not.toContain('super-secret-token');
            expect(body).not.toContain('api.example.com');
        });

        it('omits the status code when the payload carries none', async () => {
            await integration.receiveNotification(
                { name: 'testmodule' },
                'CREDENTIAL_INVALIDATED',
                { credentialId: 'cred-1' }
            );

            const [, , , body] =
                mockUpdateIntegrationMessages.execute.mock.calls[0];
            expect(body).toContain('testmodule');
            expect(body).not.toContain('HTTP');
        });

        it('does not record a diagnostic when credentials are validated', async () => {
            integration.status = 'ERROR';

            await integration.receiveNotification(
                { name: 'testmodule' },
                'CREDENTIAL_VALIDATED',
                { credentialId: 'cred-1' }
            );

            expect(
                mockUpdateIntegrationMessages.execute
            ).not.toHaveBeenCalled();
        });

        it('does not record a diagnostic when the integration is not hydrated', async () => {
            integration.id = undefined;

            await integration.receiveNotification(
                { name: 'testmodule' },
                'CREDENTIAL_INVALIDATED',
                { credentialId: 'cred-1', statusCode: 401 }
            );

            expect(
                mockUpdateIntegrationMessages.execute
            ).not.toHaveBeenCalled();
        });
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

            expect(mockUpdateIntegrationStatus.execute).toHaveBeenCalledTimes(
                1
            );
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
