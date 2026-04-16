jest.mock('../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
}));

const { Module } = require('../module');

describe('Module.markCredentialsInvalid delegate propagation', () => {
    let mockCredentialRepository;
    let mockDefinition;
    let module;

    beforeEach(() => {
        mockCredentialRepository = {
            updateAuthenticationStatus: jest.fn().mockResolvedValue(true),
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
                getCredentialDetails: jest.fn(),
                apiPropertiesToPersist: {
                    credential: [],
                    entity: [],
                },
                testAuthRequest: jest.fn(),
            },
        };

        const entityObj = {
            id: 'entity-1',
            userId: 'user-1',
            credential: { id: 'cred-1', authIsValid: true },
        };

        module = new Module({
            definition: mockDefinition,
            userId: 'user-1',
            entity: entityObj,
        });

        module.credentialRepository = mockCredentialRepository;
    });

    it('completes silently when no delegate is wired (backward compat)', async () => {
        expect(module.delegate).toBeNull();

        await expect(module.markCredentialsInvalid()).resolves.toBeUndefined();

        expect(
            mockCredentialRepository.updateAuthenticationStatus
        ).toHaveBeenCalledWith('cred-1', false);
        expect(module.credential.authIsValid).toBe(false);
    });

    it('notifies its delegate with CREDENTIAL_INVALIDATED after flipping the credential', async () => {
        const mockDelegate = {
            receiveNotification: jest.fn().mockResolvedValue(undefined),
        };
        module.delegate = mockDelegate;

        await module.markCredentialsInvalid();

        expect(mockCredentialRepository.updateAuthenticationStatus).toHaveBeenCalledWith(
            'cred-1',
            false
        );
        expect(mockDelegate.receiveNotification).toHaveBeenCalledTimes(1);
        expect(mockDelegate.receiveNotification).toHaveBeenCalledWith(
            module,
            'CREDENTIAL_INVALIDATED',
            expect.objectContaining({
                credentialId: 'cred-1',
                moduleName: 'testmodule',
            })
        );
    });
});
