jest.mock('../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
}));

const { Module } = require('../module');

describe('Module.onTokenUpdate with organization userId', () => {
    let mockCredentialRepository;
    let mockApi;
    let mockDefinition;
    let module;

    beforeEach(() => {
        // Mock credential repository
        mockCredentialRepository = {
            upsertCredential: jest.fn().mockResolvedValue({
                id: 'cred-123',
                userId: '13', // Organization user ID
                authIsValid: true,
            }),
        };

        // Mock API instance
        mockApi = {
            access_token: 'test-access-token',
            refresh_token: 'test-refresh-token',
            DLGT_TOKEN_UPDATE: 'DLGT_TOKEN_UPDATE',
        };

        // Mock module definition with required auth methods
        mockDefinition = {
            moduleName: 'testmodule',
            modelName: 'TestModule',
            API: class MockAPI {
                constructor() {}
            },
            requiredAuthMethods: {
                getToken: jest.fn(),
                getEntityDetails: jest.fn(),
                getCredentialDetails: jest.fn((api, userId) => {
                    // This should return userId in identifiers
                    return {
                        identifiers: {
                            userId: userId, // Should be passed through
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

        // Create module instance with organization userId
        const entityObj = {
            id: 'entity-123',
            userId: '13', // Organization user ID
        };

        module = new Module({
            definition: mockDefinition,
            userId: '13', // Organization user ID
            entity: entityObj,
        });

        // Replace the credential repository with our mock
        module.credentialRepository = mockCredentialRepository;
        module.api = mockApi;
    });

    it('should pass userId to credential repository when onTokenUpdate is called', async () => {
        await module.onTokenUpdate();

        expect(mockCredentialRepository.upsertCredential).toHaveBeenCalledWith(
            expect.objectContaining({
                identifiers: expect.objectContaining({
                    userId: '13', // Should include the organization userId
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
            '13' // Organization userId
        );
    });
});

describe('Module.onTokenUpdate CREDENTIAL_VALIDATED propagation', () => {
    let mockCredentialRepository;
    let mockApi;
    let mockDefinition;
    let module;

    beforeEach(() => {
        mockCredentialRepository = {
            upsertCredential: jest.fn().mockResolvedValue({
                id: 'cred-1',
                userId: 'user-1',
                authIsValid: true,
            }),
        };

        mockApi = {
            access_token: 'fresh-access-token',
            refresh_token: 'fresh-refresh-token',
            DLGT_TOKEN_UPDATE: 'TOKEN_UPDATE',
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
                getCredentialDetails: jest.fn((api, userId) => ({
                    identifiers: { userId },
                    details: {
                        access_token: api.access_token,
                        refresh_token: api.refresh_token,
                    },
                })),
                apiPropertiesToPersist: {
                    credential: ['access_token', 'refresh_token'],
                    entity: [],
                },
                testAuthRequest: jest.fn(),
            },
        };

        module = new Module({
            definition: mockDefinition,
            userId: 'user-1',
            entity: { id: 'entity-1', userId: 'user-1' },
        });
        module.credentialRepository = mockCredentialRepository;
        module.api = mockApi;
    });

    it('notifies its delegate with CREDENTIAL_VALIDATED after persisting the refreshed credential', async () => {
        const mockDelegate = {
            receiveNotification: jest.fn().mockResolvedValue(undefined),
        };
        module.delegate = mockDelegate;

        await module.onTokenUpdate();

        expect(mockCredentialRepository.upsertCredential).toHaveBeenCalledTimes(1);
        expect(mockDelegate.receiveNotification).toHaveBeenCalledWith(
            module,
            'CREDENTIAL_VALIDATED',
            expect.objectContaining({
                credentialId: 'cred-1',
                moduleName: 'testmodule',
            })
        );
    });

    it('completes silently when no delegate is wired (initial-auth path)', async () => {
        expect(module.delegate).toBeNull();

        await expect(module.onTokenUpdate()).resolves.toBeUndefined();
        expect(mockCredentialRepository.upsertCredential).toHaveBeenCalledTimes(1);
    });

    it('does not throw when the delegate fails to receive the notification', async () => {
        const mockDelegate = {
            receiveNotification: jest.fn().mockRejectedValue(new Error('delegate boom')),
        };
        module.delegate = mockDelegate;

        await expect(module.onTokenUpdate()).resolves.toBeUndefined();
        expect(mockDelegate.receiveNotification).toHaveBeenCalledWith(
            module,
            'CREDENTIAL_VALIDATED',
            expect.any(Object)
        );
    });

    it('does not emit CREDENTIAL_VALIDATED when the persisted credential has no id', async () => {
        mockCredentialRepository.upsertCredential.mockResolvedValueOnce({
            userId: 'user-1',
            authIsValid: true,
        });
        const mockDelegate = {
            receiveNotification: jest.fn().mockResolvedValue(undefined),
        };
        module.delegate = mockDelegate;

        await module.onTokenUpdate();

        expect(mockDelegate.receiveNotification).not.toHaveBeenCalledWith(
            module,
            'CREDENTIAL_VALIDATED',
            expect.any(Object)
        );
    });
});
