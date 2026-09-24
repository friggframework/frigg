jest.mock('../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
}));

const { Module } = require('../module');
const { createMemorySink } = require('../../logs');

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

    it('still writes exactly one record when testAuth fails', async () => {
        const module = makeModule({
            entity: { id: 'ent-1' },
            definition: makeDefinition({
                testAuthRequest: jest.fn(async () => {
                    throw new Error('401 from provider');
                }),
            }),
        });

        await expect(module.testAuth()).resolves.toBe(false);
        expect(sink.records).toHaveLength(1);
        expect(sink.records[0].error.message).toBe('401 from provider');
    });
});
