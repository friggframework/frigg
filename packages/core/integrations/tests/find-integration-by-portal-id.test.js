jest.mock('../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
}));

const mockFindEntity = jest.fn();
jest.mock('../../modules/repositories/module-repository-factory', () => ({
    createModuleRepository: () => ({ findEntity: mockFindEntity }),
}));

const { IntegrationBase } = require('../integration-base');

const makeIntegration = (findIntegrationsByEntityId) => {
    const instance = new IntegrationBase();
    instance.integrationRepository = { findIntegrationsByEntityId };
    return instance;
};

describe('IntegrationBase.findIntegrationByPortalId', () => {
    beforeEach(() => {
        mockFindEntity.mockReset();
    });

    it('returns null when externalId is missing', async () => {
        const instance = makeIntegration(jest.fn());
        expect(await instance.findIntegrationByPortalId(null)).toBeNull();
        expect(await instance.findIntegrationByPortalId(undefined)).toBeNull();
        expect(await instance.findIntegrationByPortalId('')).toBeNull();
        expect(mockFindEntity).not.toHaveBeenCalled();
    });

    it('returns null when no entity matches', async () => {
        mockFindEntity.mockResolvedValue(null);
        const instance = makeIntegration(jest.fn());
        const result = await instance.findIntegrationByPortalId(12345);
        expect(result).toBeNull();
        expect(mockFindEntity).toHaveBeenCalledWith({ externalId: '12345' });
    });

    it('forwards moduleName into the filter when provided', async () => {
        mockFindEntity.mockResolvedValue(null);
        const instance = makeIntegration(jest.fn());
        await instance.findIntegrationByPortalId(12345, 'hubspot');
        expect(mockFindEntity).toHaveBeenCalledWith({
            externalId: '12345',
            moduleName: 'hubspot',
        });
    });

    it('returns the integration id when a single integration owns the entity', async () => {
        mockFindEntity.mockResolvedValue({ id: 'entity-1' });
        const findIntegrations = jest
            .fn()
            .mockResolvedValue([{ id: 'integration-1' }]);
        const instance = makeIntegration(findIntegrations);
        const result = await instance.findIntegrationByPortalId(12345);
        expect(result).toBe('integration-1');
        expect(findIntegrations).toHaveBeenCalledWith('entity-1');
    });

    it('returns null when entity exists but has no owning integration (orphan)', async () => {
        mockFindEntity.mockResolvedValue({ id: 'orphan-entity' });
        const findIntegrations = jest.fn().mockResolvedValue([]);
        const instance = makeIntegration(findIntegrations);
        expect(await instance.findIntegrationByPortalId(12345)).toBeNull();
    });

    it('throws on ambiguous resolution (>1 integration) to prevent cross-tenant routing', async () => {
        mockFindEntity.mockResolvedValue({ id: 'shared-entity' });
        const findIntegrations = jest
            .fn()
            .mockResolvedValue([
                { id: 'integration-a' },
                { id: 'integration-b' },
            ]);
        const instance = makeIntegration(findIntegrations);
        await expect(
            instance.findIntegrationByPortalId(12345, 'hubspot')
        ).rejects.toThrow(
            /ambiguous resolution.*externalId=12345.*moduleName=hubspot.*2 integrations \[integration-a, integration-b\].*cross-tenant/
        );
    });

    it('coerces non-string externalId to string when building the filter', async () => {
        mockFindEntity.mockResolvedValue(null);
        const instance = makeIntegration(jest.fn());
        await instance.findIntegrationByPortalId(99999);
        expect(mockFindEntity).toHaveBeenCalledWith({ externalId: '99999' });
    });
});
