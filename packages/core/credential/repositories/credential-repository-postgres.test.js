jest.mock('../../database/prisma', () => ({
    prisma: {
        credential: {
            findMany: jest.fn(),
        },
    },
}));

const { prisma } = require('../../database/prisma');
const {
    CredentialRepositoryPostgres,
} = require('./credential-repository-postgres');

describe('CredentialRepositoryPostgres.countActiveByType', () => {
    let repo;

    beforeEach(() => {
        jest.clearAllMocks();
        repo = new CredentialRepositoryPostgres();
    });

    it('filters updatedAt >= since and groups by the related Entity.moduleName', async () => {
        prisma.credential.findMany.mockResolvedValue([
            { id: 1, entities: [{ moduleName: 'hubspot' }] },
            { id: 2, entities: [{ moduleName: 'hubspot' }] },
            { id: 3, entities: [{ moduleName: 'salesforce' }] },
            { id: 4, entities: [] },
        ]);
        const since = new Date('2026-06-01T00:00:00Z');

        const result = await repo.countActiveByType({ since });

        const arg = prisma.credential.findMany.mock.calls[0][0];
        expect(arg.where).toEqual({ updatedAt: { gte: since } });
        expect(result).toEqual([
            { integrationType: 'hubspot', count: 2 },
            { integrationType: 'salesforce', count: 1 },
            { integrationType: 'unknown', count: 1 },
        ]);
    });

    it('selects ONLY non-encrypted fields — never the encrypted `data`', async () => {
        prisma.credential.findMany.mockResolvedValue([]);

        await repo.countActiveByType({ since: new Date() });

        const arg = prisma.credential.findMany.mock.calls[0][0];
        expect(arg.select).toEqual({
            id: true,
            entities: { select: { moduleName: true } },
        });
        // The secret store must never be projected or included.
        expect(arg.select).not.toHaveProperty('data');
        expect(arg.include).toBeUndefined();
    });

    it('omits the updatedAt filter when since is not provided (count-all)', async () => {
        prisma.credential.findMany.mockResolvedValue([]);

        await repo.countActiveByType();

        const arg = prisma.credential.findMany.mock.calls[0][0];
        expect(arg.where).toEqual({});
    });
});
