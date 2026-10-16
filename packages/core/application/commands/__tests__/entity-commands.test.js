jest.mock('../../../modules/repositories/module-repository-factory', () => ({
    createModuleRepository: jest.fn(),
}));

const {
    createModuleRepository,
} = require('../../../modules/repositories/module-repository-factory');
const { createEntityCommands } = require('../entity-commands');

const decryptedCredential = {
    id: '42',
    userId: '7',
    data: { access_token: 'secret-token' },
};

const repositoryEntity = {
    id: '100',
    userId: '7',
    externalId: 'ext-1',
    name: 'Entity One',
    moduleName: 'some-module',
    credential: decryptedCredential,
};

describe('entity-commands credentialId', () => {
    let repository;

    beforeEach(() => {
        repository = {
            findEntity: jest.fn(),
            findEntityById: jest.fn(),
            createEntity: jest.fn(),
            findEntitiesByUserId: jest.fn(),
            findEntitiesByUserIdAndModuleName: jest.fn(),
            updateEntity: jest.fn(),
        };
        createModuleRepository.mockReturnValue(repository);
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    it('findEntity returns the credential id, not the decrypted credential', async () => {
        repository.findEntity.mockResolvedValue(repositoryEntity);

        const result = await createEntityCommands().findEntity({
            externalId: 'ext-1',
        });

        expect(result.credentialId).toBe('42');
    });

    it('findEntityById returns the credential id', async () => {
        repository.findEntityById.mockResolvedValue(repositoryEntity);

        const result = await createEntityCommands().findEntityById('100');

        expect(result.credentialId).toBe('42');
    });

    it('createEntity returns the credential id', async () => {
        repository.createEntity.mockResolvedValue(repositoryEntity);

        const result = await createEntityCommands().createEntity({
            userId: '7',
            externalId: 'ext-1',
            moduleName: 'some-module',
            credentialId: '42',
        });

        expect(result.credentialId).toBe('42');
    });

    it('findEntitiesByUserId returns credential ids', async () => {
        repository.findEntitiesByUserId.mockResolvedValue([repositoryEntity]);

        const result = await createEntityCommands().findEntitiesByUserId('7');

        expect(result.map((e) => e.credentialId)).toEqual(['42']);
    });

    it('findEntitiesByUserIdAndModuleName returns credential ids', async () => {
        repository.findEntitiesByUserIdAndModuleName.mockResolvedValue([
            repositoryEntity,
        ]);

        const result =
            await createEntityCommands().findEntitiesByUserIdAndModuleName(
                '7',
                'some-module'
            );

        expect(result.map((e) => e.credentialId)).toEqual(['42']);
    });

    it('updateEntity returns the credential id', async () => {
        repository.updateEntity.mockResolvedValue(repositoryEntity);

        const result = await createEntityCommands().updateEntity('100', {
            name: 'Renamed',
        });

        expect(result.credentialId).toBe('42');
    });

    it('returns a numeric credential id as a string', async () => {
        repository.findEntity.mockResolvedValue({
            ...repositoryEntity,
            credential: { id: 42, data: {} },
        });

        const result = await createEntityCommands().findEntity({
            externalId: 'ext-1',
        });

        expect(result.credentialId).toBe('42');
    });

    it('returns a null credentialId for an entity without a credential', async () => {
        repository.findEntity.mockResolvedValue({
            ...repositoryEntity,
            credential: null,
        });

        const result = await createEntityCommands().findEntity({
            externalId: 'ext-1',
        });

        expect(result.credentialId).toBeNull();
    });
});
