jest.mock('../../database/prisma', () => ({
    prisma: {
        integration: { findMany: jest.fn() },
        integrationMapping: { groupBy: jest.fn() },
    },
}));

const { prisma } = require('../../database/prisma');
const { ReportingRepositoryMongo } = require('./reporting-repository-mongo');

describe('ReportingRepositoryMongo', () => {
    let repo;

    beforeEach(() => {
        jest.clearAllMocks();
        repo = new ReportingRepositoryMongo();
    });

    it('uses string ids in the where clause and maps rows', async () => {
        prisma.integration.findMany.mockResolvedValue([
            {
                id: 'abc',
                config: { type: 'salesforce' },
                status: 'ERROR',
                userId: 'u1',
                version: '1',
                errors: [{}, {}],
                entities: [{ id: 'e1' }],
                createdAt: null,
                updatedAt: null,
            },
        ]);

        const rows = await repo.findIntegrationsForReport({
            status: 'ERROR',
            userId: 'u1',
        });

        expect(prisma.integration.findMany.mock.calls[0][0].where).toEqual({
            status: 'ERROR',
            userId: 'u1',
        });
        expect(rows[0]).toMatchObject({
            id: 'abc',
            type: 'salesforce',
            status: 'ERROR',
            moduleCount: 1,
            errorCount: 2,
        });
    });

    it('keys the mapping-count map by string id', async () => {
        prisma.integrationMapping.groupBy.mockResolvedValue([
            { integrationId: 'abc', _count: { _all: 7 } },
        ]);

        const counts = await repo.countMappingsByIntegrationIds(['abc']);

        expect(prisma.integrationMapping.groupBy.mock.calls[0][0].where).toEqual(
            { integrationId: { in: ['abc'] } }
        );
        expect(counts.get('abc')).toBe(7);
    });
});
