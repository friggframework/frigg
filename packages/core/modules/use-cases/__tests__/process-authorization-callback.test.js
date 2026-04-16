jest.mock('../../module', () => ({
    Module: jest.fn().mockImplementation(({ userId, definition, entity }) => ({
        userId,
        entity,
        credential: undefined,
        definition,
        apiClass: { requesterType: 'apiKey' },
        api: { delegate: null },
        testAuth: jest.fn().mockResolvedValue(true),
        apiParamsFromCredential: jest.fn().mockReturnValue({}),
        apiParamsFromEntity: jest.fn().mockReturnValue({}),
        getName: jest.fn().mockReturnValue('testmodule'),
    })),
}));

const {
    ProcessAuthorizationCallback,
} = require('../process-authorization-callback');
const {
    TestIntegrationRepository,
} = require('../../../integrations/tests/doubles/test-integration-repository');

describe('ProcessAuthorizationCallback — re-auth status restoration', () => {
    let integrationRepository;
    let moduleRepository;
    let credentialRepository;
    let moduleDefinitions;
    let useCase;

    beforeEach(() => {
        integrationRepository = new TestIntegrationRepository();

        moduleRepository = {
            findEntity: jest.fn().mockResolvedValue({
                id: 'entity-1',
                userId: 'user-1',
                moduleName: 'testmodule',
                externalId: 'ext-1',
                credential: 'cred-1',
            }),
            createEntity: jest.fn(),
        };

        credentialRepository = {
            upsertCredential: jest.fn().mockResolvedValue({
                id: 'cred-1',
                userId: 'user-1',
                authIsValid: true,
            }),
        };

        moduleDefinitions = [
            {
                moduleName: 'testmodule',
                modelName: 'TestModule',
                API: class {},
                requiredAuthMethods: {
                    setAuthParams: jest.fn().mockResolvedValue({}),
                    getCredentialDetails: jest.fn().mockResolvedValue({
                        identifiers: {
                            userId: 'user-1',
                            externalId: 'cred-ext',
                        },
                        details: { api_key: 'secret' },
                    }),
                    getEntityDetails: jest.fn().mockResolvedValue({
                        identifiers: {
                            userId: 'user-1',
                            externalId: 'ext-1',
                        },
                        details: { name: 'Workspace' },
                    }),
                },
            },
        ];

        useCase = new ProcessAuthorizationCallback({
            moduleRepository,
            credentialRepository,
            moduleDefinitions,
            integrationRepository,
        });
    });

    it('flips only broken integrations when a mix is linked to the entity', async () => {
        const enabledInt = await integrationRepository.createIntegration(
            ['entity-1'],
            'user-1',
            { type: 'testmodule' }
        );
        await integrationRepository.updateIntegrationStatus(
            enabledInt.id,
            'ENABLED'
        );

        const errorInt = await integrationRepository.createIntegration(
            ['entity-1'],
            'user-1',
            { type: 'testmodule' }
        );
        await integrationRepository.updateIntegrationStatus(
            errorInt.id,
            'ERROR'
        );

        const disabledInt = await integrationRepository.createIntegration(
            ['entity-1'],
            'user-1',
            { type: 'testmodule' }
        );
        await integrationRepository.updateIntegrationStatus(
            disabledInt.id,
            'DISABLED'
        );

        integrationRepository.clearHistory();

        await useCase.execute('user-1', 'testmodule', { apiKey: 'new-key' });

        const statusUpdates = integrationRepository
            .getOperationHistory()
            .filter((op) => op.operation === 'updateStatus');
        expect(statusUpdates).toHaveLength(2);

        const flippedIds = statusUpdates.map((op) => op.id).sort();
        expect(flippedIds).toEqual([errorInt.id, disabledInt.id].sort());
        expect(statusUpdates.every((op) => op.status === 'ENABLED')).toBe(
            true
        );

        const enabledAfter = await integrationRepository.findIntegrationById(
            enabledInt.id
        );
        expect(enabledAfter.status).toBe('ENABLED');
    });

    it('no-ops when no integration yet references the entity (first-time auth)', async () => {
        integrationRepository.clearHistory();

        await expect(
            useCase.execute('user-1', 'testmodule', { apiKey: 'new-key' })
        ).resolves.toBeDefined();

        const statusUpdates = integrationRepository
            .getOperationHistory()
            .filter((op) => op.operation === 'updateStatus');
        expect(statusUpdates).toHaveLength(0);
    });

    it('does not touch an integration that is already ENABLED', async () => {
        const created = await integrationRepository.createIntegration(
            ['entity-1'],
            'user-1',
            { type: 'testmodule' }
        );
        await integrationRepository.updateIntegrationStatus(
            created.id,
            'ENABLED'
        );
        integrationRepository.clearHistory();

        await useCase.execute('user-1', 'testmodule', { apiKey: 'new-key' });

        const statusUpdates = integrationRepository
            .getOperationHistory()
            .filter((op) => op.operation === 'updateStatus');
        expect(statusUpdates).toHaveLength(0);
    });

    it('flips a DISABLED integration to ENABLED after successful re-auth', async () => {
        const created = await integrationRepository.createIntegration(
            ['entity-1'],
            'user-1',
            { type: 'testmodule' }
        );
        await integrationRepository.updateIntegrationStatus(
            created.id,
            'DISABLED'
        );
        integrationRepository.clearHistory();

        await useCase.execute('user-1', 'testmodule', { apiKey: 'new-key' });

        const updated = await integrationRepository.findIntegrationById(
            created.id
        );
        expect(updated.status).toBe('ENABLED');
    });

    it('flips an ERROR integration to ENABLED after successful re-auth', async () => {
        const created = await integrationRepository.createIntegration(
            ['entity-1'],
            'user-1',
            { type: 'testmodule' }
        );
        await integrationRepository.updateIntegrationStatus(
            created.id,
            'ERROR'
        );
        integrationRepository.clearHistory();

        await useCase.execute('user-1', 'testmodule', { apiKey: 'new-key' });

        const updated = await integrationRepository.findIntegrationById(
            created.id
        );
        expect(updated.status).toBe('ENABLED');

        const statusUpdates = integrationRepository
            .getOperationHistory()
            .filter((op) => op.operation === 'updateStatus');
        expect(statusUpdates).toHaveLength(1);
        expect(statusUpdates[0]).toMatchObject({
            id: created.id,
            status: 'ENABLED',
            success: true,
        });
    });
});
