const mockRunCommandRaw = jest.fn();

jest.mock('../../database/prisma', () => ({
    prisma: { $runCommandRaw: mockRunCommandRaw },
}));
jest.mock('../../database/documentdb-utils', () => ({
    toObjectId: jest.fn((v) => (v == null || v === '' ? undefined : `oid:${v}`)),
    fromObjectId: jest.fn((v) =>
        typeof v === 'string' && v.startsWith('oid:') ? v.slice(4) : v
    ),
}));

const {
    ReportingRepositoryDocumentDB,
} = require('./reporting-repository-documentdb');

// Single-batch cursor result (id 0 → exhausted, no getMore).
const singleBatch = (firstBatch) => ({ cursor: { firstBatch, id: 0 } });

describe('ReportingRepositoryDocumentDB', () => {
    let repo;

    beforeEach(() => {
        jest.clearAllMocks();
        repo = new ReportingRepositoryDocumentDB();
    });

    it('filters by status/userId and derives moduleCount from entityIds', async () => {
        mockRunCommandRaw.mockResolvedValueOnce(
            singleBatch([
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
            ])
        );

        const rows = await repo.findIntegrationsForReport({
            status: 'ENABLED',
            userId: 'u1',
        });

        const command = mockRunCommandRaw.mock.calls[0][0];
        expect(command.find).toBe('Integration');
        expect(command.filter).toEqual({ status: 'ENABLED', userId: 'oid:u1' });
        expect(rows[0]).toMatchObject({
            id: 'i1',
            type: 'hubspot',
            moduleCount: 3,
            errorCount: 1,
        });
    });

    it('returns an empty list (does not query) when userId is not a valid id', async () => {
        const rows = await repo.findIntegrationsForReport({ userId: '' });
        expect(rows).toEqual([]);
        expect(mockRunCommandRaw).not.toHaveBeenCalled();
    });

    it('drains the cursor across multiple batches (does not stop at firstBatch)', async () => {
        mockRunCommandRaw
            .mockResolvedValueOnce({
                cursor: {
                    firstBatch: [{ _id: 'i1', entityIds: [] }],
                    id: { $numberLong: '42' },
                },
            })
            .mockResolvedValueOnce({
                cursor: { nextBatch: [{ _id: 'i2', entityIds: [] }], id: 0 },
            });

        const rows = await repo.findIntegrationsForReport({});

        expect(rows.map((r) => r.id)).toEqual(['i1', 'i2']);
        // first command = find, second command = getMore on the open cursor
        expect(mockRunCommandRaw.mock.calls[0][0].find).toBe('Integration');
        const getMore = mockRunCommandRaw.mock.calls[1][0];
        expect(getMore.getMore).toEqual({ $numberLong: '42' });
        expect(getMore.collection).toBe('Integration');
    });

    it('counts mappings by matching integrationId as a STRING via aggregation', async () => {
        mockRunCommandRaw.mockResolvedValueOnce(
            singleBatch([{ _id: 'i1', count: 9 }])
        );

        const counts = await repo.countMappingsByIntegrationIds(['i1']);

        const command = mockRunCommandRaw.mock.calls[0][0];
        expect(command.aggregate).toBe('IntegrationMapping');
        expect(command.pipeline[0]).toEqual({
            $match: { integrationId: { $in: ['i1'] } },
        });
        expect(command.pipeline[1]).toEqual({
            $group: { _id: '$integrationId', count: { $sum: 1 } },
        });
        expect(counts.get('i1')).toBe(9);
    });
});
