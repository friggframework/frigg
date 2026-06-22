jest.mock('../../database/prisma', () => ({ prisma: {} }));
jest.mock('../../database/documentdb-utils', () => ({
    toObjectId: jest.fn((v) => (v == null || v === '' ? undefined : `oid:${v}`)),
    fromObjectId: jest.fn((v) =>
        typeof v === 'string' && v.startsWith('oid:') ? v.slice(4) : v
    ),
    findMany: jest.fn(),
    aggregate: jest.fn(),
}));

const { findMany, aggregate } = require('../../database/documentdb-utils');
const {
    ReportingRepositoryDocumentDB,
} = require('./reporting-repository-documentdb');

describe('ReportingRepositoryDocumentDB', () => {
    let repo;

    beforeEach(() => {
        jest.clearAllMocks();
        repo = new ReportingRepositoryDocumentDB();
    });

    it('filters by status/userId and derives moduleCount from entityIds', async () => {
        findMany.mockResolvedValue([
            {
                _id: 'i1',
                config: { type: 'hubspot' },
                status: 'ENABLED',
                userId: 'u1',
                version: '1',
                errors: [{ title: 'boom' }],
                entityIds: ['e1', 'e2', 'e3'],
                createdAt: null,
                updatedAt: null,
            },
        ]);

        const rows = await repo.findIntegrationsForReport({
            status: 'ENABLED',
            userId: 'u1',
        });

        const filterArg = findMany.mock.calls[0][2];
        expect(filterArg).toEqual({ status: 'ENABLED', userId: 'oid:u1' });
        expect(rows[0]).toMatchObject({
            id: 'i1',
            type: 'hubspot',
            moduleCount: 3,
            errorCount: 1,
        });
    });

    it('counts mappings with a $group aggregation pipeline', async () => {
        aggregate.mockResolvedValue([{ _id: 'oid:i1', count: 9 }]);

        const counts = await repo.countMappingsByIntegrationIds(['i1']);

        const [, collection, pipeline] = aggregate.mock.calls[0];
        expect(collection).toBe('IntegrationMapping');
        expect(pipeline[1]).toEqual({
            $group: { _id: '$integrationId', count: { $sum: 1 } },
        });
        expect(counts.get('i1')).toBe(9);
    });
});
