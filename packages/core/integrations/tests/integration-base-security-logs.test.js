jest.mock('../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
}));

const { IntegrationBase } = require('../integration-base');
const { FetchError } = require('../../errors');
const { createMemorySink } = require('../../logs');
const { SECRETS } = require('../../logs/__fixtures__/secrets');

class HubspotIntegration extends IntegrationBase {
    static Definition = { name: 'hubspot', version: '1.0.0', modules: {} };
}

let sink;
let consoleSpies;
let integration;

beforeEach(() => {
    sink = createMemorySink();
    consoleSpies = ['log', 'warn', 'error'].map((method) =>
        jest.spyOn(console, method).mockImplementation()
    );
    integration = new HubspotIntegration();
    integration.id = 'int-1';
    integration.status = 'ENABLED';
    integration.updateIntegrationStatus = { execute: jest.fn() };
    integration.updateIntegrationMessages = { execute: jest.fn() };
});

afterEach(() => consoleSpies.forEach((spy) => spy.mockRestore()));

const expectNoConsole = () =>
    consoleSpies.forEach((spy) => expect(spy).not.toHaveBeenCalled());

const byEvent = (eventName) =>
    sink.records.filter((r) => r.eventName === eventName);

describe('IntegrationBase security call sites (ADR-048 Phase 2)', () => {
    it('credentials_invalidated keeps the status and scrubs a FetchError reason', async () => {
        const reason = new FetchError({
            resource: `https://api.example.com/me?api_key=${SECRETS.apiKeyQuery}`,
            response: { status: 401 },
        }).message.concat(`\nAuthorization: Bearer ${SECRETS.bearer}`);

        await integration.receiveNotification(
            { name: 'testmodule' },
            'CREDENTIAL_INVALIDATED',
            { credentialId: 'cred-1', reason, statusCode: 401 }
        );

        const [record] = byEvent('integration.hubspot.credentials_invalidated');
        expect(record).toMatchObject({
            level: 'WARN',
            moduleName: 'testmodule',
            statusCode: 401,
            integrationId: 'int-1',
        });
        expect(record.reason).toContain('api_key=REDACTED');
        expect(sink.records).toContainNoSecretWindow(SECRETS);
        expectNoConsole();
    });

    it('credentials_validated is INFO', async () => {
        integration.status = 'ERROR';

        await integration.receiveNotification(
            { name: 'testmodule' },
            'CREDENTIAL_VALIDATED',
            {}
        );

        expect(byEvent('integration.hubspot.credentials_validated')[0]).toMatchObject({
            level: 'INFO',
            moduleName: 'testmodule',
        });
        expectNoConsole();
    });

    it('persistStatus writes INFO status_changed with the new status', async () => {
        await integration.persistStatus('DISABLED');

        expect(byEvent('integration.hubspot.status_changed')[0]).toMatchObject({
            level: 'INFO',
            integrationStatus: 'DISABLED',
        });
        expectNoConsole();
    });

    it('reconcileAuthStatus logs auth_failed (WARN) and auth_confirmed (INFO)', async () => {
        await integration.reconcileAuthStatus(false);
        await integration.reconcileAuthStatus(true);

        expect(byEvent('integration.hubspot.auth_failed')[0].level).toBe('WARN');
        expect(byEvent('integration.hubspot.auth_confirmed')[0].level).toBe('INFO');
        expectNoConsole();
    });

    it('a failed rejection record writes one ERROR', async () => {
        integration.updateIntegrationMessages.execute.mockRejectedValue(
            new Error(`db write failed Bearer ${SECRETS.bearer}`)
        );

        await integration.receiveNotification(
            { name: 'testmodule' },
            'CREDENTIAL_INVALIDATED',
            { credentialId: 'cred-1', statusCode: 401 }
        );

        const [record] = byEvent(
            'integration.hubspot.credential_rejection_record_failed'
        );
        expect(record.level).toBe('ERROR');
        expect(record.error.message).toBe(
            `db write failed Bearer [REDACTED:${SECRETS.bearer.length}]`
        );
        expect(integration.status).toBe('ERROR');
        expectNoConsole();
    });

    it('addError stores a fixed message and logs the error once', () => {
        const error = new Error(`boom Bearer ${SECRETS.bearer}`);

        integration.addError(error);

        expect(integration.messages.errors).toEqual([
            {
                title: 'Integration Error',
                message: 'Integration int-1 hit an error. Contact support.',
                timestamp: expect.any(Number),
            },
        ]);
        expect(integration.status).toBe('ERROR');
        const [record] = byEvent('integration.hubspot.error_recorded');
        expect(record.level).toBe('ERROR');
        expect(record.error.type).toBe('Error');
        expect(integration.messages).toContainNoSecretWindow(SECRETS);
        expect(sink.records).toContainNoSecretWindow(SECRETS);
    });

    it('initialize() records a loadDynamicUserActions failure through addError', async () => {
        integration.loadDynamicUserActions = async () => {
            throw new Error(`upstream said Bearer ${SECRETS.bearer}`);
        };

        await integration.initialize();

        expect(integration.messages.errors[0].title).toBe('Integration Error');
        expect(byEvent('integration.hubspot.error_recorded')).toHaveLength(1);
        expect(integration.messages).toContainNoSecretWindow(SECRETS);
    });
});
