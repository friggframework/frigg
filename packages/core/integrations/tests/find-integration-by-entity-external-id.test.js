jest.mock('../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
}));

const mockFindEntities = jest.fn();
jest.mock('../../modules/repositories/module-repository-factory', () => ({
    createModuleRepository: () => ({ findEntities: mockFindEntities }),
}));

const { IntegrationBase } = require('../integration-base');

const makeIntegration = (findIntegrationsByEntityId) => {
    const instance = new IntegrationBase();
    instance.integrationRepository = { findIntegrationsByEntityId };
    return instance;
};

describe('IntegrationBase.findIntegrationByEntityExternalId', () => {
    beforeEach(() => {
        mockFindEntities.mockReset();
    });

    it('returns null when externalId is missing', async () => {
        const instance = makeIntegration(jest.fn());
        expect(
            await instance.findIntegrationByEntityExternalId(null)
        ).toBeNull();
        expect(
            await instance.findIntegrationByEntityExternalId(undefined)
        ).toBeNull();
        expect(
            await instance.findIntegrationByEntityExternalId('')
        ).toBeNull();
        expect(mockFindEntities).not.toHaveBeenCalled();
    });

    it('returns null when no entity matches', async () => {
        mockFindEntities.mockResolvedValue([]);
        const instance = makeIntegration(jest.fn());
        const result = await instance.findIntegrationByEntityExternalId(12345);
        expect(result).toBeNull();
        expect(mockFindEntities).toHaveBeenCalledWith({ externalId: '12345' });
    });

    it('forwards moduleName into the filter when provided', async () => {
        mockFindEntities.mockResolvedValue([]);
        const instance = makeIntegration(jest.fn());
        await instance.findIntegrationByEntityExternalId(12345, 'hubspot');
        expect(mockFindEntities).toHaveBeenCalledWith({
            externalId: '12345',
            moduleName: 'hubspot',
        });
    });

    it('returns the integration id when one entity has one owning integration', async () => {
        mockFindEntities.mockResolvedValue([{ id: 'entity-1' }]);
        const findIntegrations = jest
            .fn()
            .mockResolvedValue([{ id: 'integration-1' }]);
        const instance = makeIntegration(findIntegrations);
        const result = await instance.findIntegrationByEntityExternalId(12345);
        expect(result).toBe('integration-1');
        expect(findIntegrations).toHaveBeenCalledWith('entity-1');
    });

    it('returns null when entity exists but has no owning integration (orphan)', async () => {
        mockFindEntities.mockResolvedValue([{ id: 'orphan-entity' }]);
        const findIntegrations = jest.fn().mockResolvedValue([]);
        const instance = makeIntegration(findIntegrations);
        expect(
            await instance.findIntegrationByEntityExternalId(12345)
        ).toBeNull();
    });

    it('throws on entity-level ambiguity (>1 entity matches externalId) to prevent cross-tenant routing', async () => {
        // This is the Codex-flagged case: two entities share the same externalId.
        // The old implementation called findEntity (first match only) and silently
        // ignored the duplicate, so the downstream integration check never saw it.
        mockFindEntities.mockResolvedValue([
            { id: 'entity-a' },
            { id: 'entity-b' },
        ]);
        const findIntegrations = jest.fn();
        const instance = makeIntegration(findIntegrations);
        await expect(
            instance.findIntegrationByEntityExternalId(12345)
        ).rejects.toThrow(
            /ambiguous resolution.*externalId=12345.*2 entities \[entity-a, entity-b\].*cross-tenant/
        );
        expect(findIntegrations).not.toHaveBeenCalled();
    });

    it('throws on integration-level ambiguity (one entity, >1 owning integration)', async () => {
        mockFindEntities.mockResolvedValue([{ id: 'shared-entity' }]);
        const findIntegrations = jest
            .fn()
            .mockResolvedValue([
                { id: 'integration-a' },
                { id: 'integration-b' },
            ]);
        const instance = makeIntegration(findIntegrations);
        await expect(
            instance.findIntegrationByEntityExternalId(12345, 'hubspot')
        ).rejects.toThrow(
            /ambiguous resolution.*externalId=12345.*moduleName=hubspot.*2 integrations \[integration-a, integration-b\].*cross-tenant/
        );
    });

    it('coerces non-string externalId to string when building the filter', async () => {
        mockFindEntities.mockResolvedValue([]);
        const instance = makeIntegration(jest.fn());
        await instance.findIntegrationByEntityExternalId(99999);
        expect(mockFindEntities).toHaveBeenCalledWith({ externalId: '99999' });
    });
});

describe('IntegrationBase.listIntegrationsByEntityExternalId', () => {
    beforeEach(() => {
        mockFindEntities.mockReset();
    });

    it('returns empty array when externalId is missing', async () => {
        const instance = makeIntegration(jest.fn());
        expect(
            await instance.listIntegrationsByEntityExternalId(null)
        ).toEqual([]);
        expect(mockFindEntities).not.toHaveBeenCalled();
    });

    it('returns empty array when no entity matches', async () => {
        mockFindEntities.mockResolvedValue([]);
        const instance = makeIntegration(jest.fn());
        expect(
            await instance.listIntegrationsByEntityExternalId(12345)
        ).toEqual([]);
    });

    it('returns all integration IDs across multiple matching entities', async () => {
        mockFindEntities.mockResolvedValue([
            { id: 'entity-a' },
            { id: 'entity-b' },
        ]);
        const findIntegrations = jest
            .fn()
            .mockResolvedValueOnce([{ id: 'integration-1' }])
            .mockResolvedValueOnce([
                { id: 'integration-2' },
                { id: 'integration-3' },
            ]);
        const instance = makeIntegration(findIntegrations);
        const result =
            await instance.listIntegrationsByEntityExternalId(12345);
        expect(result.sort()).toEqual([
            'integration-1',
            'integration-2',
            'integration-3',
        ]);
    });

    it('deduplicates integration IDs when the same integration owns multiple matched entities', async () => {
        mockFindEntities.mockResolvedValue([
            { id: 'entity-a' },
            { id: 'entity-b' },
        ]);
        const findIntegrations = jest
            .fn()
            .mockResolvedValue([{ id: 'integration-1' }]);
        const instance = makeIntegration(findIntegrations);
        const result =
            await instance.listIntegrationsByEntityExternalId(12345);
        expect(result).toEqual(['integration-1']);
    });

    it('does not throw on ambiguous resolution (point of the helper)', async () => {
        mockFindEntities.mockResolvedValue([
            { id: 'entity-a' },
            { id: 'entity-b' },
        ]);
        const findIntegrations = jest
            .fn()
            .mockResolvedValueOnce([{ id: 'i1' }])
            .mockResolvedValueOnce([{ id: 'i2' }]);
        const instance = makeIntegration(findIntegrations);
        await expect(
            instance.listIntegrationsByEntityExternalId(12345)
        ).resolves.toEqual(['i1', 'i2']);
    });

    it('forwards moduleName into the filter', async () => {
        mockFindEntities.mockResolvedValue([]);
        const instance = makeIntegration(jest.fn());
        await instance.listIntegrationsByEntityExternalId(12345, 'hubspot');
        expect(mockFindEntities).toHaveBeenCalledWith({
            externalId: '12345',
            moduleName: 'hubspot',
        });
    });

    it('coerces non-string externalId to string when building the filter', async () => {
        mockFindEntities.mockResolvedValue([]);
        const instance = makeIntegration(jest.fn());
        await instance.listIntegrationsByEntityExternalId(99999);
        expect(mockFindEntities).toHaveBeenCalledWith({ externalId: '99999' });
    });
});
