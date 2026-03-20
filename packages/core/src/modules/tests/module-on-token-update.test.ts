jest.mock('../../database/config', () => ({
    __esModule: true,
    default: {
        DB_TYPE: 'mongodb',
        getDatabaseType: jest.fn(() => 'mongodb'),
        PRISMA_LOG_LEVEL: 'error,warn',
        PRISMA_QUERY_LOGGING: false,
    },
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    getDbType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
}));

jest.mock('../../credential/repositories/credential-repository-factory', () => ({
    createCredentialRepository: jest.fn(() => ({
        upsertCredential: jest.fn(),
        updateAuthenticationStatus: jest.fn(),
        deleteCredentialById: jest.fn(),
    })),
}));

jest.mock('../repositories/module-repository-factory', () => ({
    createModuleRepository: jest.fn(() => ({
        unsetCredential: jest.fn(),
    })),
}));

import { Module } from '../module';

describe('Module.onTokenUpdate with organization userId', () => {
    let mockCredentialRepository: any;
    let mockApi: any;
    let mockDefinition: any;
    let module: any;

    beforeEach(() => {
        mockCredentialRepository = {
            upsertCredential: jest.fn().mockResolvedValue({
                id: 'cred-123',
                userId: '13',
                authIsValid: true,
            }),
        };

        mockApi = {
            access_token: 'test-access-token',
            refresh_token: 'test-refresh-token',
            DLGT_TOKEN_UPDATE: 'DLGT_TOKEN_UPDATE',
        };

        mockDefinition = {
            moduleName: 'testmodule',
            modelName: 'TestModule',
            API: class MockAPI {
                constructor() {}
            },
            requiredAuthMethods: {
                getToken: jest.fn(),
                getEntityDetails: jest.fn(),
                getCredentialDetails: jest.fn((api: any, userId: string) => {
                    return {
                        identifiers: {
                            userId: userId,
                        },
                        details: {
                            access_token: api.access_token,
                            refresh_token: api.refresh_token,
                        },
                    };
                }),
                apiPropertiesToPersist: {
                    credential: ['access_token', 'refresh_token'],
                    entity: [],
                },
                testAuthRequest: jest.fn(),
            },
        };

        const entityObj = {
            id: 'entity-123',
            userId: '13',
        };

        module = new Module({
            definition: mockDefinition,
            userId: '13',
            entity: entityObj,
        });

        module.credentialRepository = mockCredentialRepository;
        module.api = mockApi;
    });

    it('should pass userId to credential repository when onTokenUpdate is called', async () => {
        await module.onTokenUpdate();

        expect(mockCredentialRepository.upsertCredential).toHaveBeenCalledWith(
            expect.objectContaining({
                identifiers: expect.objectContaining({
                    userId: '13',
                }),
                details: expect.objectContaining({
                    access_token: 'test-access-token',
                    refresh_token: 'test-refresh-token',
                    authIsValid: true,
                }),
            })
        );
    });

    it('should not throw "userId required in identifiers" error', async () => {
        await expect(module.onTokenUpdate()).resolves.not.toThrow();
    });

    it('should call getCredentialDetails with correct userId', async () => {
        await module.onTokenUpdate();

        expect(mockDefinition.requiredAuthMethods.getCredentialDetails).toHaveBeenCalledWith(
            mockApi,
            '13'
        );
    });
});
