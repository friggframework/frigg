jest.mock('../../database/prisma', () => ({
    prisma: {
        integration: { findMany: jest.fn() },
        integrationMapping: { groupBy: jest.fn() },
    },
}));

const { prisma } = require('../../database/prisma');
const {
    ReportingRepositoryPostgres,
} = require('./reporting-repository-postgres');

describe('ReportingRepositoryPostgres', () => {
    let repo;

    beforeEach(() => {
        jest.clearAllMocks();
        repo = new ReportingRepositoryPostgres();
    });

    it('applies status/userId to the where clause and maps rows (only scalar + entity ids)', async () => {
        prisma.integration.findMany.mockResolvedValue([
            {
                id: 17,
                config: { type: 'hubspot' },
                status: 'ENABLED',
                userId: 3,
                version: '1.0.0',
                errors: [],
                entities: [{ id: 1 }, { id: 2 }],
                createdAt: new Date('2026-01-01T00:00:00Z'),
                updatedAt: new Date('2026-01-02T00:00:00Z'),
            },
        ]);

        const rows = await repo.findIntegrationsForReport({
            status: 'ENABLED',
            userId: '3',
        });

        const callArg = prisma.integration.findMany.mock.calls[0][0];
        expect(callArg.where).toEqual({ status: 'ENABLED', userId: 3 });
        expect(callArg.include).toEqual({ entities: { select: { id: true } } });
        expect(rows[0]).toMatchObject({
            id: '17',
            type: 'hubspot',
            status: 'ENABLED',
            userId: '3',
            moduleCount: 2,
            errorCount: 0,
        });
    });

    it('counts errors from the errors array', async () => {
        prisma.integration.findMany.mockResolvedValue([
            {
                id: 1,
                config: { type: 'x' },
                status: 'ERROR',
                errors: [{ title: 'a' }, { title: 'b' }, { title: 'c' }],
                entities: [],
            },
        ]);
        const rows = await repo.findIntegrationsForReport({});
        expect(rows[0].errorCount).toBe(3);
        expect(rows[0].moduleCount).toBe(0);
    });

    it('groups mapping counts by integrationId into a Map keyed by string id', async () => {
        prisma.integrationMapping.groupBy.mockResolvedValue([
            { integrationId: 17, _count: { _all: 412 } },
        ]);

        const counts = await repo.countMappingsByIntegrationIds(['17']);

        const arg = prisma.integrationMapping.groupBy.mock.calls[0][0];
        expect(arg.by).toEqual(['integrationId']);
        expect(arg.where).toEqual({ integrationId: { in: [17] } });
        expect(counts.get('17')).toBe(412);
    });

    it('returns an empty map and skips the query for no ids', async () => {
        const counts = await repo.countMappingsByIntegrationIds([]);
        expect(counts.size).toBe(0);
        expect(prisma.integrationMapping.groupBy).not.toHaveBeenCalled();
    });
});
