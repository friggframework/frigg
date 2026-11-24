jest.mock('../../module', () => ({
    Module: jest.fn(),
}));

const { Module } = require('../../module');
const {
    ProcessAuthorizationCallback,
} = require('../process-authorization-callback');
const { createMemorySink } = require('../../../logs');
const { SECRETS } = require('../../../logs/__fixtures__/secrets');

const LOGGER = 'frigg.modules.authorization_callback';

describe('ProcessAuthorizationCallback logs (ADR-048)', () => {
    let sink;
    let consoleSpies;
    let moduleRepository;
    let credentialRepository;
    let integrationRepository;
    let requiredAuthMethods;
    let useCase;

    const mockModule = (requesterType) => {
        Module.mockImplementation(({ userId, definition, entity }) => ({
            userId,
            entity,
            credential: undefined,
            definition,
            apiClass: { requesterType },
            api: {},
            testAuth: jest.fn().mockResolvedValue(true),
            apiParamsFromCredential: jest.fn().mockReturnValue({}),
            apiParamsFromEntity: jest.fn().mockReturnValue({}),
            getName: jest.fn().mockReturnValue('testmodule'),
        }));
    };

    const buildUseCase = () =>
        new ProcessAuthorizationCallback({
            moduleRepository,
            credentialRepository,
            moduleDefinitions: [
                { moduleName: 'testmodule', requiredAuthMethods },
            ],
            integrationRepository,
        });

    const byEvent = (suffix) =>
        sink.records.filter((r) => r.eventName === `${LOGGER}.${suffix}`);

    beforeEach(() => {
        sink = createMemorySink();
        consoleSpies = ['log', 'info', 'warn', 'error', 'debug'].map((m) =>
            jest.spyOn(console, m).mockImplementation(() => {})
        );

        moduleRepository = {
            findEntitiesByUserIdAndModuleName: jest.fn().mockResolvedValue([
                {
                    id: 'entity-1',
                    credential: { id: 'cred-1' },
                },
            ]),
            findEntity: jest.fn().mockResolvedValue({
                id: 'entity-1',
                credential: { id: 'cred-1' },
            }),
            createEntity: jest.fn(),
            updateEntity: jest.fn(),
        };
        credentialRepository = {
            upsertCredential: jest
                .fn()
                .mockResolvedValue({ id: 'cred-1', authIsValid: true }),
        };
        integrationRepository = {
            findIntegrationsByEntityId: jest.fn().mockResolvedValue([]),
            updateIntegrationStatus: jest.fn().mockResolvedValue({}),
        };
        requiredAuthMethods = {
            getToken: jest.fn().mockResolvedValue({
                access_token: SECRETS.accessToken,
                refresh_token: SECRETS.refreshToken,
            }),
            setAuthParams: jest.fn().mockResolvedValue({}),
            getCredentialDetails: jest.fn().mockResolvedValue({
                identifiers: { userId: 'user-1', externalId: 'cred-ext' },
                details: { access_token: SECRETS.accessToken },
            }),
            getEntityDetails: jest.fn().mockResolvedValue({
                identifiers: { userId: 'user-1', externalId: 'ext-1' },
                details: { name: 'Workspace' },
            }),
        };
        mockModule('oauth2');
        useCase = buildUseCase();
    });

    afterEach(() => {
        for (const spy of consoleSpies) expect(spy).not.toHaveBeenCalled();
        jest.restoreAllMocks();
    });

    it('writes each OAuth2 step as a DEBUG record with ids as fields', async () => {
        await useCase.execute('user-1', 'testmodule', { code: SECRETS.oauthCode });

        expect(byEvent('started')).toEqual([
            expect.objectContaining({
                level: 'DEBUG',
                logger: LOGGER,
                userId: 'user-1',
                entityType: 'testmodule',
                hasCode: true,
            }),
        ]);
        expect(byEvent('existing_entity_found')).toEqual([
            expect.objectContaining({
                level: 'DEBUG',
                entityId: 'entity-1',
                credentialId: 'cred-1',
            }),
        ]);
        expect(byEvent('module_created')).toEqual([
            expect.objectContaining({
                level: 'DEBUG',
                moduleName: 'testmodule',
                authType: 'oauth2',
            }),
        ]);
        expect(byEvent('token_exchanged')).toEqual([
            expect.objectContaining({
                level: 'DEBUG',
                tokenKeys: ['access_token', 'refresh_token'],
            }),
        ]);
        expect(byEvent('credential_persisted')).toEqual([
            expect.objectContaining({
                level: 'DEBUG',
                credentialId: 'cred-1',
                authIsValid: true,
            }),
        ]);
        expect(byEvent('auth_test_passed')).toHaveLength(1);
        expect(byEvent('entity_details_received')).toEqual([
            expect.objectContaining({ externalId: 'ext-1' }),
        ]);
        expect(byEvent('completed')).toEqual([
            expect.objectContaining({
                level: 'DEBUG',
                entityId: 'entity-1',
                credentialId: 'cred-1',
            }),
        ]);
    });

    it('writes the setAuthParams step for a non-OAuth2 module', async () => {
        mockModule('apiKey');
        await buildUseCase().execute('user-1', 'testmodule', { apiKey: 'k' });

        expect(byEvent('auth_params_setting')).toHaveLength(1);
        expect(byEvent('token_exchanged')).toHaveLength(0);
        expect(byEvent('credential_persisted')).toHaveLength(1);
    });

    it('never writes token values, only token keys', async () => {
        await useCase.execute('user-1', 'testmodule', { code: SECRETS.oauthCode });

        expect(sink.records).toContainNoSecretWindow([
            SECRETS.accessToken,
            SECRETS.refreshToken,
            SECRETS.oauthCode,
        ]);
    });

    it('writes no ERROR record when testAuth fails; the boundary logs the throw', async () => {
        Module.mockImplementation(() => ({
            credential: { id: 'cred-1' },
            apiClass: { requesterType: 'apiKey' },
            api: {},
            testAuth: jest.fn().mockResolvedValue(false),
            apiParamsFromCredential: jest.fn().mockReturnValue({}),
            getName: jest.fn().mockReturnValue('testmodule'),
        }));

        await expect(
            buildUseCase().execute('user-1', 'testmodule', {})
        ).rejects.toThrow('Authorization failed');

        expect(
            sink.records.filter((r) => ['WARN', 'ERROR'].includes(r.level))
        ).toHaveLength(0);
    });

    it('writes an INFO record for each integration restored on re-auth', async () => {
        integrationRepository.findIntegrationsByEntityId.mockResolvedValue([
            { id: 'int-1', status: 'ERROR' },
            { id: 'int-2', status: 'ENABLED' },
        ]);

        await useCase.execute('user-1', 'testmodule', { code: SECRETS.oauthCode });

        expect(byEvent('integration_restored')).toEqual([
            expect.objectContaining({
                level: 'INFO',
                integrationId: 'int-1',
                previousStatus: 'ERROR',
                entityId: 'entity-1',
            }),
        ]);
        expect(byEvent('integrations_restored')).toEqual([
            expect.objectContaining({
                level: 'DEBUG',
                entityId: 'entity-1',
                restoredCount: 1,
            }),
        ]);
    });

    it('writes one ERROR record and still resolves when restoring integrations fails', async () => {
        const failure = new Error('db down');
        integrationRepository.findIntegrationsByEntityId.mockRejectedValue(
            failure
        );

        await expect(
            useCase.execute('user-1', 'testmodule', { code: SECRETS.oauthCode })
        ).resolves.toMatchObject({ entity_id: 'entity-1' });

        expect(byEvent('integrations_restore_failed')).toEqual([
            expect.objectContaining({
                level: 'ERROR',
                entityId: 'entity-1',
                error: expect.objectContaining({ message: 'db down' }),
            }),
        ]);
    });

    it('writes an INFO record when re-auth repoints an entity to a new credential', async () => {
        moduleRepository.findEntity.mockResolvedValue({
            id: 'entity-1',
            credential: { id: 'old-cred' },
        });
        moduleRepository.updateEntity.mockResolvedValue({ id: 'entity-1' });

        await useCase.execute('user-1', 'testmodule', { code: SECRETS.oauthCode });

        expect(byEvent('entity_credential_repointed')).toEqual([
            expect.objectContaining({
                level: 'INFO',
                entityId: 'entity-1',
                previousCredentialId: 'old-cred',
                credentialId: 'cred-1',
            }),
        ]);
    });
});
