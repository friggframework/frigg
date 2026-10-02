const {
    FindIntegrationByEntityExternalIdUseCase,
} = require('./find-integration-by-entity-external-id');
const {
    ListIntegrationsByEntityExternalIdUseCase,
} = require('./list-integrations-by-entity-external-id');

const makeRepos = (entities, ownersFn) => ({
    moduleRepository: {
        findEntities: jest.fn().mockResolvedValue(entities),
    },
    integrationRepository: {
        findIntegrationsByEntityId: jest.fn(ownersFn),
    },
});

describe('FindIntegrationByEntityExternalIdUseCase', () => {
    it('throws when repositories are missing', () => {
        expect(() => new FindIntegrationByEntityExternalIdUseCase({})).toThrow(
            /integrationRepository is required/
        );
        expect(
            () =>
                new FindIntegrationByEntityExternalIdUseCase({
                    integrationRepository: {},
                })
        ).toThrow(/moduleRepository is required/);
    });

    it('returns null when externalId is missing', async () => {
        const { moduleRepository, integrationRepository } = makeRepos(
            [],
            () => []
        );
        const useCase = new FindIntegrationByEntityExternalIdUseCase({
            integrationRepository,
            moduleRepository,
        });
        expect(await useCase.execute({ externalId: null })).toBeNull();
        expect(await useCase.execute({ externalId: undefined })).toBeNull();
        expect(await useCase.execute({ externalId: '' })).toBeNull();
        expect(moduleRepository.findEntities).not.toHaveBeenCalled();
    });

    it('returns null when no entity matches', async () => {
        const { moduleRepository, integrationRepository } = makeRepos(
            [],
            () => []
        );
        const useCase = new FindIntegrationByEntityExternalIdUseCase({
            integrationRepository,
            moduleRepository,
        });
        const result = await useCase.execute({ externalId: 12345 });
        expect(result).toBeNull();
        expect(moduleRepository.findEntities).toHaveBeenCalledWith({
            externalId: '12345',
        });
    });

    it('forwards moduleName into the filter when provided', async () => {
        const { moduleRepository, integrationRepository } = makeRepos(
            [],
            () => []
        );
        const useCase = new FindIntegrationByEntityExternalIdUseCase({
            integrationRepository,
            moduleRepository,
        });
        await useCase.execute({ externalId: 12345, moduleName: 'hubspot' });
        expect(moduleRepository.findEntities).toHaveBeenCalledWith({
            externalId: '12345',
            moduleName: 'hubspot',
        });
    });

    it('returns the integration id when one entity has one owning integration', async () => {
        const { moduleRepository, integrationRepository } = makeRepos(
            [{ id: 'entity-1' }],
            () => [{ id: 'integration-1' }]
        );
        const useCase = new FindIntegrationByEntityExternalIdUseCase({
            integrationRepository,
            moduleRepository,
        });
        const result = await useCase.execute({ externalId: 12345 });
        expect(result).toBe('integration-1');
        expect(
            integrationRepository.findIntegrationsByEntityId
        ).toHaveBeenCalledWith('entity-1');
    });

    it('returns null when entity exists but has no owning integration (orphan)', async () => {
        const { moduleRepository, integrationRepository } = makeRepos(
            [{ id: 'orphan-entity' }],
            () => []
        );
        const useCase = new FindIntegrationByEntityExternalIdUseCase({
            integrationRepository,
            moduleRepository,
        });
        expect(await useCase.execute({ externalId: 12345 })).toBeNull();
    });

    it('throws on entity-level ambiguity (>1 entity matches externalId)', async () => {
        const { moduleRepository, integrationRepository } = makeRepos(
            [{ id: 'entity-a' }, { id: 'entity-b' }],
            () => []
        );
        const useCase = new FindIntegrationByEntityExternalIdUseCase({
            integrationRepository,
            moduleRepository,
        });
        await expect(useCase.execute({ externalId: 12345 })).rejects.toThrow(
            /ambiguous resolution.*externalId=12345.*2 entities \[entity-a, entity-b\].*cross-tenant/
        );
        expect(
            integrationRepository.findIntegrationsByEntityId
        ).not.toHaveBeenCalled();
    });

    it('throws on integration-level ambiguity (one entity, >1 owning integration)', async () => {
        const { moduleRepository, integrationRepository } = makeRepos(
            [{ id: 'shared-entity' }],
            () => [{ id: 'integration-a' }, { id: 'integration-b' }]
        );
        const useCase = new FindIntegrationByEntityExternalIdUseCase({
            integrationRepository,
            moduleRepository,
        });
        await expect(
            useCase.execute({ externalId: 12345, moduleName: 'hubspot' })
        ).rejects.toThrow(
            /ambiguous resolution.*externalId=12345.*moduleName=hubspot.*2 integrations \[integration-a, integration-b\].*cross-tenant/
        );
    });

    it('coerces non-string externalId to string when building the filter', async () => {
        const { moduleRepository, integrationRepository } = makeRepos(
            [],
            () => []
        );
        const useCase = new FindIntegrationByEntityExternalIdUseCase({
            integrationRepository,
            moduleRepository,
        });
        await useCase.execute({ externalId: 99999 });
        expect(moduleRepository.findEntities).toHaveBeenCalledWith({
            externalId: '99999',
        });
    });
});

describe('ListIntegrationsByEntityExternalIdUseCase', () => {
    it('throws when repositories are missing', () => {
        expect(
            () => new ListIntegrationsByEntityExternalIdUseCase({})
        ).toThrow(/integrationRepository is required/);
    });

    it('returns empty array when externalId is missing', async () => {
        const { moduleRepository, integrationRepository } = makeRepos(
            [],
            () => []
        );
        const useCase = new ListIntegrationsByEntityExternalIdUseCase({
            integrationRepository,
            moduleRepository,
        });
        expect(await useCase.execute({ externalId: null })).toEqual([]);
        expect(moduleRepository.findEntities).not.toHaveBeenCalled();
    });

    it('returns empty array when no entity matches', async () => {
        const { moduleRepository, integrationRepository } = makeRepos(
            [],
            () => []
        );
        const useCase = new ListIntegrationsByEntityExternalIdUseCase({
            integrationRepository,
            moduleRepository,
        });
        expect(await useCase.execute({ externalId: 12345 })).toEqual([]);
    });

    it('returns all integration IDs across multiple matching entities', async () => {
        const findOwners = jest
            .fn()
            .mockResolvedValueOnce([{ id: 'integration-1' }])
            .mockResolvedValueOnce([
                { id: 'integration-2' },
                { id: 'integration-3' },
            ]);
        const useCase = new ListIntegrationsByEntityExternalIdUseCase({
            integrationRepository: {
                findIntegrationsByEntityId: findOwners,
            },
            moduleRepository: {
                findEntities: jest
                    .fn()
                    .mockResolvedValue([
                        { id: 'entity-a' },
                        { id: 'entity-b' },
                    ]),
            },
        });
        const result = await useCase.execute({ externalId: 12345 });
        expect(result.sort()).toEqual([
            'integration-1',
            'integration-2',
            'integration-3',
        ]);
    });

    it('deduplicates integration IDs across multiple matched entities', async () => {
        const { moduleRepository, integrationRepository } = makeRepos(
            [{ id: 'entity-a' }, { id: 'entity-b' }],
            () => [{ id: 'integration-1' }]
        );
        const useCase = new ListIntegrationsByEntityExternalIdUseCase({
            integrationRepository,
            moduleRepository,
        });
        const result = await useCase.execute({ externalId: 12345 });
        expect(result).toEqual(['integration-1']);
    });

    it('does not throw on ambiguous resolution', async () => {
        const findOwners = jest
            .fn()
            .mockResolvedValueOnce([{ id: 'i1' }])
            .mockResolvedValueOnce([{ id: 'i2' }]);
        const useCase = new ListIntegrationsByEntityExternalIdUseCase({
            integrationRepository: {
                findIntegrationsByEntityId: findOwners,
            },
            moduleRepository: {
                findEntities: jest
                    .fn()
                    .mockResolvedValue([
                        { id: 'entity-a' },
                        { id: 'entity-b' },
                    ]),
            },
        });
        await expect(
            useCase.execute({ externalId: 12345 })
        ).resolves.toEqual(['i1', 'i2']);
    });

    it('forwards moduleName into the filter', async () => {
        const { moduleRepository, integrationRepository } = makeRepos(
            [],
            () => []
        );
        const useCase = new ListIntegrationsByEntityExternalIdUseCase({
            integrationRepository,
            moduleRepository,
        });
        await useCase.execute({ externalId: 12345, moduleName: 'hubspot' });
        expect(moduleRepository.findEntities).toHaveBeenCalledWith({
            externalId: '12345',
            moduleName: 'hubspot',
        });
    });

    it('coerces non-string externalId to string when building the filter', async () => {
        const { moduleRepository, integrationRepository } = makeRepos(
            [],
            () => []
        );
        const useCase = new ListIntegrationsByEntityExternalIdUseCase({
            integrationRepository,
            moduleRepository,
        });
        await useCase.execute({ externalId: 99999 });
        expect(moduleRepository.findEntities).toHaveBeenCalledWith({
            externalId: '99999',
        });
    });
});
