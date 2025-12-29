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

        expect(
            mockDefinition.requiredAuthMethods.getCredentialDetails
        ).toHaveBeenCalledWith(
            mockApi,
            '13' // Organization userId
        );
    });
});
