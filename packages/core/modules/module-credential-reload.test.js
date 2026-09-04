jest.mock('../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
}));

const { Module } = require('./module');

/**
 * Module side of the credential reload. DLGT_CREDENTIAL_RELOAD asks the
 * Module for the currently stored credential. The Module reads the row by
 * id, updates its own this.credential, and returns the token fields the api
 * persists. The reload never writes anything, and it never touches
 * authIsValid.
 */

class MockApi {
    constructor(params) {
        this.access_token = params.access_token;
        this.refresh_token = params.refresh_token;
        this.delegate = params.delegate;
        this.DLGT_TOKEN_UPDATE = 'TOKEN_UPDATE';
        this.DLGT_TOKEN_DEAUTHORIZED = 'TOKEN_DEAUTHORIZED';
        this.DLGT_INVALID_AUTH = 'INVALID_AUTH';
        this.DLGT_CREDENTIAL_RELOAD = 'CREDENTIAL_RELOAD';
    }
}
MockApi.requesterType = 'oauth2';

const definition = {
    moduleName: 'testmodule',
    modelName: 'TestModule',
    API: MockApi,
    requiredAuthMethods: {
        getToken: async () => {},
        getEntityDetails: async () => {},
        getCredentialDetails: async () => {},
        apiPropertiesToPersist: {
            credential: ['access_token', 'refresh_token'],
            entity: [],
        },
        testAuthRequest: async () => true,
    },
};

function makeModule({ storedRow, credentialId = 'cred-1' } = {}) {
    const module = new Module({
        definition,
        userId: 'user-1',
        entity: {
            id: 'entity-1',
            credential: {
                id: credentialId,
                data: {
                    access_token: 'access-old',
                    refresh_token: 'refresh-old',
                },
            },
        },
    });
    module.credentialRepository = {
        findCredentialById:
            storedRow instanceof Error
                ? jest.fn().mockRejectedValue(storedRow)
                : jest.fn().mockResolvedValue(storedRow),
        upsertCredential: jest.fn(),
        updateAuthenticationStatus: jest.fn(),
    };
    return module;
}

describe('Module credential reload', () => {
    it('returns the stored token fields on DLGT_CREDENTIAL_RELOAD', async () => {
        // Real adapter shape: findCredentialById spreads the decrypted token
        // fields at the TOP LEVEL (credential-repository-mongo.js `...data`).
        // There is no nested `data` key. The first version of this test
        // mocked a nested shape and hid an always-null reload.
        const module = makeModule({
            storedRow: {
                id: 'cred-1',
                userId: 'user-1',
                externalId: 'ext-1',
                authIsValid: true,
                access_token: 'access-new',
                refresh_token: 'refresh-new',
                unrelated_field: 'never-exposed',
            },
        });

        const result = await module.receiveNotification(
            module.api,
            'CREDENTIAL_RELOAD'
        );

        expect(result).toEqual({
            access_token: 'access-new',
            refresh_token: 'refresh-new',
        });
    });

    it('replaces this.credential with the fresh row', async () => {
        const fresh = { id: 'cred-1', access_token: 'a2', refresh_token: 'r2' };
        const module = makeModule({ storedRow: fresh });

        await module.receiveNotification(module.api, 'CREDENTIAL_RELOAD');

        expect(module.credential).toBe(fresh);
    });

    it('never writes during a reload', async () => {
        const module = makeModule({
            storedRow: { id: 'cred-1', access_token: 'a2', refresh_token: 'r2' },
        });

        await module.receiveNotification(module.api, 'CREDENTIAL_RELOAD');

        expect(module.credentialRepository.upsertCredential).not.toHaveBeenCalled();
        expect(
            module.credentialRepository.updateAuthenticationStatus
        ).not.toHaveBeenCalled();
    });

    it('returns null when the row is gone', async () => {
        const module = makeModule({ storedRow: null });

        const result = await module.receiveNotification(
            module.api,
            'CREDENTIAL_RELOAD'
        );

        expect(result).toBeNull();
    });

    it('returns null when the module holds no credential id', async () => {
        const module = makeModule({
            storedRow: { id: 'x', access_token: 'a', refresh_token: 'r' },
        });
        module.credential = null;

        const result = await module.receiveNotification(
            module.api,
            'CREDENTIAL_RELOAD'
        );

        expect(result).toBeNull();
        expect(
            module.credentialRepository.findCredentialById
        ).not.toHaveBeenCalled();
    });
});
