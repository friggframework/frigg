jest.mock('../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
}));

const { Module } = require('../module');
const { createMemorySink } = require('../../logs');
const { FetchError } = require('../../errors');
const { SECRETS } = require('../../logs/__fixtures__/secrets');

class RecordingApi {
    constructor(params = {}) {
        this.params = params;
        this.logger = params.logger;
        this.access_token = 'a';
        this.refresh_token = 'r';
    }
}

function makeDefinition(overrides = {}) {
    return {
        moduleName: 'testmodule',
        modelName: 'TestModule',
        API: RecordingApi,
        requiredAuthMethods: {
            getToken: jest.fn(),
            getEntityDetails: jest.fn(),
            getCredentialDetails: jest.fn(async () => ({
                identifiers: { userId: 'u1' },
                details: {},
            })),
            apiPropertiesToPersist: {
                credential: ['access_token', 'refresh_token'],
                entity: [],
            },
            testAuthRequest: jest.fn(),
            ...overrides,
        },
    };
}

function makeModule({ entity, definition = makeDefinition() } = {}) {
    const module = new Module({ definition, userId: 'u1', entity });
    module.credentialRepository = {
        upsertCredential: jest.fn(async () => ({ id: 'cred-new' })),
        deleteCredentialById: jest.fn(async () => {}),
    };
    module.moduleRepository = { unsetCredential: jest.fn(async () => {}) };
    return module;
}

let sink;

beforeEach(() => {
    sink = createMemorySink();
});

describe('Module logger', () => {
    it('names the logger module.<moduleName>', () => {
        makeModule({ entity: { id: 'ent-1' } }).logger.info('x');
        expect(sink.records[0].logger).toBe('module.testmodule');
    });

    it('names the logger module.unknown when moduleName is missing', () => {
        class LenientModule extends Module {
            validateDefinition() {}
        }
        const definition = makeDefinition();
        delete definition.moduleName;
        const module = new LenientModule({ definition, entity: { id: 'ent-1' } });
        module.credentialRepository = {};

        expect(module.logger.name).toBe('module.unknown');
    });

    it('passes its logger to the api params', () => {
        const module = makeModule({ entity: { id: 'ent-1' } });
        expect(typeof module.logger.info).toBe('function');
        expect(module.api.params.logger).toBe(module.logger);
    });

    it('binds entityId from entity.id and credentialId from credential.id', () => {
        const module = makeModule({
            entity: { id: 'ent-1', credential: { id: 'cred-1', data: {} } },
        });
        module.logger.info('x');
        expect(sink.records[0]).toMatchObject({
            entityId: 'ent-1',
            credentialId: 'cred-1',
        });
    });

    it('binds a bare-id credential as credentialId', () => {
        const module = makeModule({ entity: { id: 'ent-1', credential: 'cred-bare' } });
        module.logger.info('x');
        expect(sink.records[0].credentialId).toBe('cred-bare');
    });

    it('shows the persisted credential id after onTokenUpdate', async () => {
        const module = makeModule({ entity: { id: 'ent-1' } });
        module.logger.info('before');
        await module.onTokenUpdate();
        module.logger.info('after');

        expect(sink.records[0]).not.toHaveProperty('credentialId');
        expect(sink.records[1].credentialId).toBe('cred-new');
    });

    it('drops credentialId after deauthorize, keeps entityId and the api logger', async () => {
        const module = makeModule({
            entity: { id: 'ent-1', credential: { id: 'cred-1', data: {} } },
        });

        await module.deauthorize();
        module.logger.info('after');

        const record = sink.records[sink.records.length - 1];
        expect(record.entityId).toBe('ent-1');
        expect(record).not.toHaveProperty('credentialId');
        expect(module.api.logger).toBe(module.logger);
    });
});

describe('Module security call sites (ADR-048 Phase 2)', () => {
    let consoleSpies;

    beforeEach(() => {
        consoleSpies = ['log', 'warn', 'error'].map((method) =>
            jest.spyOn(console, method).mockImplementation()
        );
    });

    afterEach(() => consoleSpies.forEach((spy) => spy.mockRestore()));

    const expectNoConsole = () =>
        consoleSpies.forEach((spy) => expect(spy).not.toHaveBeenCalled());

    const byEvent = (eventName) =>
        sink.records.filter((r) => r.eventName === eventName);

    const leakyFetchError = () => {
        const url = `https://api.example.com/me?api_key=${SECRETS.apiKeyQuery}`;
        const cause = new Error(
            `request to ${url} failed; Authorization: Bearer ${SECRETS.bearer}`
        );
        return new FetchError({
            resource: url,
            init: { headers: { Authorization: `Bearer ${SECRETS.bearer}` } },
            response: { status: 401 },
            responseBody: `{"access_token":"${SECRETS.accessToken}"}`,
            cause,
        });
    };

    it('testAuth failure writes one WARN test_auth_failed with the sanitized URL', async () => {
        const module = makeModule({
            entity: { id: 'ent-1' },
            definition: makeDefinition({
                testAuthRequest: jest.fn(async () => {
                    throw leakyFetchError();
                }),
            }),
        });

        await expect(module.testAuth()).resolves.toBe(false);

        const records = byEvent('module.testmodule.test_auth_failed');
        expect(records).toHaveLength(1);
        expect(sink.records).toHaveLength(1);
        expect(records[0].level).toBe('WARN');
        expect(records[0].error.message).toBe(
            'GET https://api.example.com/me?api_key=REDACTED 401'
        );
        expect(sink.records).toContainNoSecretWindow(SECRETS);
        expectNoConsole();
    });

    it('rejected credentials write WARN credentials_rejected with statusCode, no message text', async () => {
        const module = makeModule({
            entity: { id: 'ent-1', credential: { id: 'cred-1', data: {} } },
        });
        module.credentialRepository.updateAuthenticationStatus = jest.fn();

        await module.markCredentialsInvalid(leakyFetchError());

        const [record] = byEvent('module.testmodule.credentials_rejected');
        expect(record.level).toBe('WARN');
        expect(record.statusCode).toBe(401);
        expect(record.error.status).toBe(401);
        expect(record).not.toHaveProperty('message', expect.stringContaining('api_key'));
        expect(sink.records).toContainNoSecretWindow(SECRETS);
        expectNoConsole();
    });

    it('a failed CREDENTIAL_INVALIDATED propagation writes one ERROR', async () => {
        const module = makeModule({
            entity: { id: 'ent-1', credential: { id: 'cred-1', data: {} } },
        });
        module.credentialRepository.updateAuthenticationStatus = jest.fn();
        module.delegate = {
            receiveNotification: jest.fn(async () => {
                throw new Error(`db down Bearer ${SECRETS.bearer}`);
            }),
        };

        await module.markCredentialsInvalid();

        const [record] = byEvent(
            'module.testmodule.credential_invalidated_propagation_failed'
        );
        expect(record.level).toBe('ERROR');
        expect(record.error.type).toBe('Error');
        expect(sink.records).toContainNoSecretWindow(SECRETS);
        expectNoConsole();
    });

    it('a failed CREDENTIAL_VALIDATED propagation writes one ERROR', async () => {
        const module = makeModule({ entity: { id: 'ent-1' } });
        module.delegate = {
            receiveNotification: jest.fn(async () => {
                throw new Error('db down');
            }),
        };

        await module.onTokenUpdate();

        expect(
            byEvent('module.testmodule.credential_validated_propagation_failed')
        ).toHaveLength(1);
        expectNoConsole();
    });

    it('a refreshable api without refresh_token writes WARN refresh_token_missing', async () => {
        const module = makeModule({ entity: { id: 'ent-1' } });
        module.api.refresh_token = undefined;
        module.api.isRefreshable = true;

        await module.onTokenUpdate();

        const [record] = byEvent('module.testmodule.refresh_token_missing');
        expect(record.level).toBe('WARN');
        expectNoConsole();
    });
});
