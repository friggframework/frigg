jest.mock('../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
}));

const { IntegrationBase } = require('../integration-base');
const { createMemorySink } = require('../../logs');

const invalidatedRecords = (sink) =>
    sink.records.filter((r) => r.eventName?.endsWith('.credentials_invalidated'));

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

    describe('already in ERROR', () => {
        it('does not write again when the same integration is reported twice', async () => {
            const payload = { credentialId: 'cred-1', statusCode: 401 };

            await integration.receiveNotification(
                { name: 'testmodule' },
                'CREDENTIAL_INVALIDATED',
                payload
            );
            await integration.receiveNotification(
                { name: 'testmodule' },
                'CREDENTIAL_INVALIDATED',
                payload
            );

            expect(mockUpdateIntegrationStatus.execute).toHaveBeenCalledTimes(
                1
            );
            expect(mockUpdateIntegrationMessages.execute).toHaveBeenCalledTimes(
                1
            );
        });

        it('still flips a second integration that shares the same credential', async () => {
            const shared = { credentialId: 'cred-1', statusCode: 401 };
            const other = new IntegrationBase();
            other.id = 'int-2';
            other.status = 'ENABLED';
            other.updateIntegrationStatus = { execute: jest.fn() };
            other.updateIntegrationMessages = { execute: jest.fn() };

            await integration.receiveNotification(
                { name: 'testmodule' },
                'CREDENTIAL_INVALIDATED',
                shared
            );
            await other.receiveNotification(
                { name: 'testmodule' },
                'CREDENTIAL_INVALIDATED',
                shared
            );

            expect(other.updateIntegrationStatus.execute).toHaveBeenCalledWith(
                'int-2',
                'ERROR'
            );
            expect(other.status).toBe('ERROR');
        });
    });

    it('includes the diagnostic reason and status code in the record when present', async () => {
        const sink = createMemorySink();
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
        expect(invalidatedRecords(sink)).toEqual([
            expect.objectContaining({
                level: 'WARN',
                moduleName: 'testmodule',
                statusCode: 401,
                reason: 'Unauthorized',
            }),
        ]);
    });

    it('writes the record without statusCode or reason when none is provided', async () => {
        const sink = createMemorySink();
        await integration.receiveNotification(
            { name: 'testmodule' },
            'CREDENTIAL_INVALIDATED',
            { credentialId: 'cred-1', moduleName: 'testmodule' }
        );
        const [record] = invalidatedRecords(sink);
        expect(record.moduleName).toBe('testmodule');
        expect(record).not.toHaveProperty('statusCode');
        expect(record).not.toHaveProperty('reason');
    });

    describe('recorded diagnostic', () => {
        it('records an Authentication Error naming the module and status code', async () => {
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
            const sink = createMemorySink();

            await integration.receiveNotification(
                { name: 'testmodule' },
                'CREDENTIAL_INVALIDATED',
                { credentialId: 'cred-1', statusCode: 401 }
            );

            expect(
                sink.records.filter((r) =>
                    r.eventName?.endsWith('.credential_rejection_record_failed')
                )
            ).toHaveLength(1);

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

    describe('RATE_LIMITED', () => {
        const retryAt = new Date('2026-09-28T14:30:15.000Z');
        const payload = {
            moduleName: 'testmodule',
            reason: 'daily',
            retryAt,
            policy: 'DAILY',
            statusCode: 429,
            links: [
                {
                    label: 'API usage limits',
                    url: 'https://developers.example.com/limits',
                },
            ],
        };
        const rateLimitedRecords = (sink) =>
            sink.records.filter((r) => r.eventName?.endsWith('.rate_limited'));
        let mockRecordRateLimitMessage;

        beforeEach(() => {
            mockRecordRateLimitMessage = {
                execute: jest.fn().mockResolvedValue(true),
            };
            integration.recordRateLimitMessage = mockRecordRateLimitMessage;
        });

        it('records the message for this integration with the payload of the module', async () => {
            await integration.receiveNotification(
                { name: 'testmodule' },
                'RATE_LIMITED',
                payload
            );

            expect(mockRecordRateLimitMessage.execute).toHaveBeenCalledTimes(1);
            expect(mockRecordRateLimitMessage.execute).toHaveBeenCalledWith(
                'int-1',
                payload
            );
        });

        it('takes the module name from the notifier when the payload has none', async () => {
            const withoutName = { ...payload };
            delete withoutName.moduleName;

            await integration.receiveNotification(
                { name: 'testmodule' },
                'RATE_LIMITED',
                withoutName
            );

            expect(mockRecordRateLimitMessage.execute).toHaveBeenCalledWith(
                'int-1',
                { ...withoutName, moduleName: 'testmodule' }
            );
        });

        it('never changes the status of the integration', async () => {
            await integration.receiveNotification(
                { name: 'testmodule' },
                'RATE_LIMITED',
                payload
            );

            expect(mockUpdateIntegrationStatus.execute).not.toHaveBeenCalled();
            expect(integration.status).toBe('ENABLED');
        });

        it('leaves the errors of the integration alone', async () => {
            await integration.receiveNotification(
                { name: 'testmodule' },
                'RATE_LIMITED',
                payload
            );

            expect(
                mockUpdateIntegrationMessages.execute
            ).not.toHaveBeenCalled();
        });

        it('does nothing when the integration has no id yet', async () => {
            integration.id = undefined;

            await integration.receiveNotification(
                { name: 'testmodule' },
                'RATE_LIMITED',
                payload
            );

            expect(mockRecordRateLimitMessage.execute).not.toHaveBeenCalled();
        });

        it('writes one WARN with the module, the reason and the reset time', async () => {
            const sink = createMemorySink();

            await integration.receiveNotification(
                { name: 'testmodule' },
                'RATE_LIMITED',
                payload
            );

            expect(rateLimitedRecords(sink)).toEqual([
                expect.objectContaining({
                    level: 'WARN',
                    moduleName: 'testmodule',
                    reason: 'daily',
                    retryAt: '2026-09-28T14:30:15.000Z',
                    integrationId: 'int-1',
                }),
            ]);
        });

        it('writes one ERROR and resolves when the message cannot be recorded', async () => {
            const sink = createMemorySink();
            mockRecordRateLimitMessage.execute.mockRejectedValue(
                new Error('db write failed')
            );

            await expect(
                integration.receiveNotification(
                    { name: 'testmodule' },
                    'RATE_LIMITED',
                    payload
                )
            ).resolves.toBeUndefined();

            expect(
                sink.records.filter((r) =>
                    r.eventName?.endsWith('.rate_limit_message_record_failed')
                )
            ).toEqual([
                expect.objectContaining({
                    level: 'ERROR',
                    error: expect.objectContaining({
                        message: 'db write failed',
                    }),
                }),
            ]);
            expect(mockUpdateIntegrationStatus.execute).not.toHaveBeenCalled();
        });

        it('is wired to the repository of the integration', () => {
            const fresh = new IntegrationBase();

            expect(fresh.recordRateLimitMessage.integrationRepository).toBe(
                fresh.integrationRepository
            );
        });
    });
});
