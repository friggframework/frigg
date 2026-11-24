const {
    CreateEntityFromCredential,
} = require('../create-entity-from-credential');
const {
    findModuleDefinitionForEntity,
} = require('../../utils/find-module-definition');

const user = (id) => ({ getId: () => id });

function build({ credential } = {}) {
    const definition = {
        moduleName: 'acme',
        requiredAuthMethods: {
            getEntityDetails: jest.fn(async (api, _p, _t, userId) => ({
                identifiers: { externalId: 'acct-1', user: userId },
                details: { name: 'Acme', token: api.tokens.access_token },
            })),
        },
    };
    const processAuthorizationCallback = {
        findOrCreateEntity: jest.fn(async () => ({ id: 'ent-1' })),
    };
    const credentialRepository = {
        findCredentialById: jest.fn(async () => credential),
    };
    const createModule = jest.fn(({ entity }) => ({
        api: { tokens: entity.credential.data },
        apiParamsFromEntity: () => ({ subdomain: 'eu' }),
    }));
    const useCase = new CreateEntityFromCredential({
        processAuthorizationCallback,
        credentialRepository,
        moduleDefinitions: [definition],
        createModule,
    });
    return { useCase, definition, processAuthorizationCallback, createModule };
}

describe('CreateEntityFromCredential', () => {
    const owned = { id: 'c1', userId: '7', externalId: 'x', authIsValid: true, access_token: 'at' };

    it('builds the module on the stored credential and persists through ProcessAuthorizationCallback.findOrCreateEntity', async () => {
        const { useCase, processAuthorizationCallback, createModule } = build({ credential: owned });

        await expect(
            useCase.execute({ user: user('7'), entityType: 'acme', credentialId: 'c1' })
        ).resolves.toEqual({ id: 'ent-1' });

        expect(createModule).toHaveBeenCalledWith(
            expect.objectContaining({
                userId: '7',
                entity: {
                    credential: { id: 'c1', userId: '7', externalId: 'x', authIsValid: true, data: { access_token: 'at' } },
                },
            })
        );
        expect(processAuthorizationCallback.findOrCreateEntity).toHaveBeenCalledWith(
            {
                identifiers: { externalId: 'acct-1', user: '7' },
                details: { name: 'Acme', token: 'at', subdomain: 'eu' },
            },
            'acme',
            'c1'
        );
    });

    it.each([
        ['missing', null],
        ["another user's", { ...owned, userId: '8' }],
    ])('refuses a %s credential with the same 400', async (_label, credential) => {
        const { useCase, processAuthorizationCallback } = build({ credential });
        await expect(
            useCase.execute({ user: user('7'), entityType: 'acme', credentialId: 'c1' })
        ).rejects.toMatchObject({ isBoom: true, output: { statusCode: 400 }, message: 'Invalid credential ID' });
        expect(processAuthorizationCallback.findOrCreateEntity).not.toHaveBeenCalled();
    });

    it('refuses an unknown entity type', async () => {
        const { useCase } = build({ credential: owned });
        await expect(
            useCase.execute({ user: user('7'), entityType: 'other', credentialId: 'c1' })
        ).rejects.toMatchObject({ output: { statusCode: 400 } });
    });
});

describe('findModuleDefinitionForEntity', () => {
    const defs = [{ moduleName: 'acme' }, { moduleName: 'beta', modelName: 'LegacyBeta' }];

    it('matches on the stored moduleName, or a legacy modelName', () => {
        expect(findModuleDefinitionForEntity(defs, { moduleName: 'acme' })).toBe(defs[0]);
        expect(findModuleDefinitionForEntity(defs, { moduleName: 'LegacyBeta' })).toBe(defs[1]);
    });

    it('returns undefined when nothing matches or the entity has no type', () => {
        expect(findModuleDefinitionForEntity(defs, { moduleName: 'zzz' })).toBeUndefined();
        expect(findModuleDefinitionForEntity(defs, {})).toBeUndefined();
        expect(findModuleDefinitionForEntity(undefined, { moduleName: 'acme' })).toBeUndefined();
    });
});
