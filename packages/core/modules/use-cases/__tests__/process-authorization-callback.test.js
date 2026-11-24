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
                credential: { id: 'cred-1' },
            }),
            findEntitiesByUserIdAndModuleName: jest.fn().mockResolvedValue([
                {
                    id: 'entity-1',
                    userId: 'user-1',
                    moduleName: 'testmodule',
                    externalId: 'ext-1',
                    credential: { id: 'cred-1', authIsValid: false },
                },
            ]),
            createEntity: jest.fn(),
            updateEntity: jest.fn().mockImplementation((entityId, updates) =>
                Promise.resolve({
                    id: entityId,
                    userId: 'user-1',
                    moduleName: 'testmodule',
                    externalId: 'ext-1',
                    credential: { id: updates.credential },
                })
            ),
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

    it('persists credentials explicitly on OAuth2 re-auth (belt-and-suspenders)', async () => {
        // Force the OAuth2 path
        const { Module } = require('../../module');
        Module.mockImplementation(({ userId, definition, entity }) => ({
            userId,
            entity,
            credential: undefined,
            definition,
            apiClass: { requesterType: 'oauth2' },
            api: { delegate: null },
            testAuth: jest.fn().mockResolvedValue(true),
            apiParamsFromCredential: jest.fn().mockReturnValue({}),
            apiParamsFromEntity: jest.fn().mockReturnValue({}),
            getName: jest.fn().mockReturnValue('testmodule'),
        }));

        moduleDefinitions[0].requiredAuthMethods.getToken = jest
            .fn()
            .mockResolvedValue({
                access_token: 'fresh-access',
                refresh_token: 'fresh-refresh',
            });

        await useCase.execute('user-1', 'testmodule', { code: 'oauth-code' });

        // upsertCredential must be called once even on the OAuth2 path —
        // we no longer rely solely on the DLGT_TOKEN_UPDATE notification.
        expect(credentialRepository.upsertCredential).toHaveBeenCalledTimes(1);
        expect(
            credentialRepository.upsertCredential.mock.calls[0][0].details
                .authIsValid
        ).toBe(true);
    });

    it('repoints existing entity credentialId when re-auth produces a different credential', async () => {
        // Reset Module mock back to the apiKey default (a prior test
        // mutated it to oauth2).
        const { Module } = require('../../module');
        Module.mockImplementation(({ userId, definition, entity }) => ({
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
        }));

        // Existing entity is linked to cred-1 (e.g. workspace A);
        // the just-upserted credential is cred-2 (workspace B). The
        // entity must be repointed so the integration uses the fresh
        // tokens.
        credentialRepository.upsertCredential = jest.fn().mockResolvedValue({
            id: 'cred-2',
            userId: 'user-1',
            authIsValid: true,
        });

        await useCase.execute('user-1', 'testmodule', { apiKey: 'new-key' });

        expect(moduleRepository.updateEntity).toHaveBeenCalledTimes(1);
        expect(moduleRepository.updateEntity).toHaveBeenCalledWith('entity-1', {
            credential: 'cred-2',
        });
    });

    it('does not repoint when the existing entity already points at the upserted credential', async () => {
        const { Module } = require('../../module');
        Module.mockImplementation(({ userId, definition, entity }) => ({
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
        }));

        // upsert returns cred-1, same as the entity already has
        credentialRepository.upsertCredential = jest.fn().mockResolvedValue({
            id: 'cred-1',
            userId: 'user-1',
            authIsValid: true,
        });

        await useCase.execute('user-1', 'testmodule', { apiKey: 'new-key' });

        expect(moduleRepository.updateEntity).not.toHaveBeenCalled();
    });
});
