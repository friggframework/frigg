/**
 * countByIntegrationIds tests for the integration-mapping repository adapters.
 *
 * ADR-010 folds the reporting subsystem's mapped-record count into the mapping
 * repository so reports read it through the command layer. These cases preserve
 * what the retired reporting-repository-*.test.js verified: grouped counts keyed
 * by integration id, the empty-ids short-circuit, strict integer-id rejection
 * (Postgres), string-id matching on DocumentDB, and the DocumentDB aggregate
 * cursor drain.
 */

const {
    IntegrationMappingRepositoryPostgres,
} = require('./integration-mapping-repository-postgres');
const {
    IntegrationMappingRepositoryMongo,
} = require('./integration-mapping-repository-mongo');
const {
    IntegrationMappingRepositoryDocumentDB,
} = require('./integration-mapping-repository-documentdb');

describe('IntegrationMappingRepositoryPostgres.countByIntegrationIds', () => {
    let repo;
    let mockPrisma;

    beforeEach(() => {
        mockPrisma = { integrationMapping: { groupBy: jest.fn() } };
        repo = new IntegrationMappingRepositoryPostgres();
        repo.prisma = mockPrisma;
    });

    it('groups counts by integration id (ids converted to int, keys to string)', async () => {
        mockPrisma.integrationMapping.groupBy.mockResolvedValue([
            { integrationId: 7, _count: { _all: 3 } },
            { integrationId: 9, _count: { _all: 1 } },
        ]);

        const counts = await repo.countByIntegrationIds(['7', '9']);

        expect(mockPrisma.integrationMapping.groupBy).toHaveBeenCalledWith({
            by: ['integrationId'],
            where: { integrationId: { in: [7, 9] } },
            _count: { _all: true },
        });
        expect(counts.get('7')).toBe(3);
        expect(counts.get('9')).toBe(1);
    });

    it('short-circuits to an empty map for no ids', async () => {
        const counts = await repo.countByIntegrationIds([]);
        expect(counts.size).toBe(0);
        expect(mockPrisma.integrationMapping.groupBy).not.toHaveBeenCalled();
    });

    it('rejects a non-integer id instead of silently coercing it', async () => {
        await expect(
            repo.countByIntegrationIds(['12abc'])
        ).rejects.toThrow(/cannot be converted to integer/);
        expect(mockPrisma.integrationMapping.groupBy).not.toHaveBeenCalled();
    });
});

describe('IntegrationMappingRepositoryMongo.countByIntegrationIds', () => {
    let repo;
    let mockPrisma;

    beforeEach(() => {
        mockPrisma = { integrationMapping: { groupBy: jest.fn() } };
        repo = new IntegrationMappingRepositoryMongo();
        repo.prisma = mockPrisma;
    });

    it('matches string ids and keys the map by string integration id', async () => {
        mockPrisma.integrationMapping.groupBy.mockResolvedValue([
            { integrationId: '507f1f77bcf86cd799439011', _count: { _all: 5 } },
        ]);

        const counts = await repo.countByIntegrationIds([
            '507f1f77bcf86cd799439011',
        ]);

        expect(mockPrisma.integrationMapping.groupBy).toHaveBeenCalledWith({
            by: ['integrationId'],
            where: { integrationId: { in: ['507f1f77bcf86cd799439011'] } },
            _count: { _all: true },
        });
        expect(counts.get('507f1f77bcf86cd799439011')).toBe(5);
    });
});

describe('IntegrationMappingRepositoryDocumentDB.countByIntegrationIds', () => {
    let repo;
    let mockPrisma;

    beforeEach(() => {
        mockPrisma = { $runCommandRaw: jest.fn() };
        repo = new IntegrationMappingRepositoryDocumentDB();
        repo.prisma = mockPrisma;
    });

    it('aggregates by string ids and drains the cursor across batches', async () => {
        mockPrisma.$runCommandRaw
            .mockResolvedValueOnce({
                cursor: { id: 5, firstBatch: [{ _id: '7', count: 3 }] },
            })
            .mockResolvedValueOnce({
                cursor: { id: 0, nextBatch: [{ _id: '9', count: 2 }] },
            });

        const counts = await repo.countByIntegrationIds([7, 9]);

        const aggregateCall = mockPrisma.$runCommandRaw.mock.calls[0][0];
        expect(aggregateCall.aggregate).toBe('IntegrationMapping');
        expect(aggregateCall.pipeline[0]).toEqual({
            $match: { integrationId: { $in: ['7', '9'] } },
        });
        expect(mockPrisma.$runCommandRaw.mock.calls[1][0]).toMatchObject({
            getMore: 5,
            collection: 'IntegrationMapping',
        });
        expect(counts.get('7')).toBe(3);
        expect(counts.get('9')).toBe(2);
    });

    it('short-circuits to an empty map for no ids', async () => {
        const counts = await repo.countByIntegrationIds([]);
        expect(counts.size).toBe(0);
        expect(mockPrisma.$runCommandRaw).not.toHaveBeenCalled();
    });
});
