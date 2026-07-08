jest.mock('../../database/prisma', () => ({
    prisma: { $runCommandRaw: jest.fn() },
}));

const { prisma } = require('../../database/prisma');
const {
    UsageRepositoryDocumentDB,
} = require('./usage-repository-documentdb');

describe('UsageRepositoryDocumentDB (raw-command adapter)', () => {
    let repo;
    beforeEach(() => {
        jest.clearAllMocks();
        repo = new UsageRepositoryDocumentDB();
    });

    describe('increment', () => {
        it('issues a raw upsert with $inc + $setOnInsert keyed by the compound unique', async () => {
            prisma.$runCommandRaw.mockResolvedValue({ ok: 1, n: 1 });

            await repo.increment({
                integrationId: 'int_1',
                integrationType: 'hubspot',
                metric: 'records.synced',
                window: 'day:2026-07-05',
                value: 3,
            });

            expect(prisma.$runCommandRaw).toHaveBeenCalledTimes(1);
            const cmd = prisma.$runCommandRaw.mock.calls[0][0];
            expect(cmd.update).toBe('UsageCounter');
            expect(cmd.updates[0]).toEqual({
                q: {
                    integrationId: 'int_1',
                    integrationType: 'hubspot',
                    metric: 'records.synced',
                    window: 'day:2026-07-05',
                },
                u: {
                    $inc: { value: 3 },
                    $setOnInsert: {
                        integrationId: 'int_1',
                        integrationType: 'hubspot',
                        metric: 'records.synced',
                        window: 'day:2026-07-05',
                    },
                },
                upsert: true,
            });
        });
    });

    describe('totals', () => {
        it('aggregates a single window granularity, grouping by the dimension, coercing extended-JSON sums', async () => {
            prisma.$runCommandRaw.mockResolvedValue({
                cursor: {
                    id: 0,
                    firstBatch: [
                        { _id: 'hubspot', value: { $numberLong: '12' } },
                        { _id: 'salesforce', value: 4 },
                    ],
                },
            });

            const result = await repo.totals({
                metric: 'records.synced',
                groupBy: 'integrationType',
                since: new Date('2026-07-01T00:00:00Z'),
            });

            const cmd = prisma.$runCommandRaw.mock.calls[0][0];
            expect(cmd.aggregate).toBe('UsageCounter');
            expect(cmd.pipeline[0].$match).toEqual({
                metric: 'records.synced',
                window: { $regex: '^day:', $gte: 'day:2026-07-01' },
            });
            expect(cmd.pipeline[1]).toEqual({
                $group: { _id: '$integrationType', value: { $sum: '$value' } },
            });
            expect(result).toEqual([
                { integrationType: 'hubspot', value: 12 },
                { integrationType: 'salesforce', value: 4 },
            ]);
            expect(typeof result[0].value).toBe('number');
        });

        it('rejects an un-allowlisted groupBy', async () => {
            await expect(
                repo.totals({ metric: 'm', groupBy: 'userId' })
            ).rejects.toThrow(/groupBy/i);
        });
    });

    describe('series', () => {
        it('range-filters on the window key, sorts, and drains the cursor across batches', async () => {
            prisma.$runCommandRaw
                .mockResolvedValueOnce({
                    cursor: {
                        id: 42,
                        firstBatch: [
                            { _id: 'day:2026-07-04', value: 5 },
                        ],
                    },
                })
                .mockResolvedValueOnce({
                    cursor: {
                        id: 0,
                        nextBatch: [{ _id: 'day:2026-07-05', value: 14 }],
                    },
                });

            const result = await repo.series({
                metric: 'records.synced',
                integrationType: 'hubspot',
                from: new Date('2026-07-01T00:00:00Z'),
                to: new Date('2026-07-05T00:00:00Z'),
                bucket: 'day',
            });

            const cmd = prisma.$runCommandRaw.mock.calls[0][0];
            expect(cmd.pipeline[0].$match).toEqual({
                metric: 'records.synced',
                integrationType: 'hubspot',
                window: {
                    $regex: '^day:',
                    $gte: 'day:2026-07-01',
                    $lte: 'day:2026-07-05',
                },
            });
            expect(cmd.pipeline[2]).toEqual({ $sort: { _id: 1 } });
            // drained: getMore issued for the open cursor
            expect(prisma.$runCommandRaw).toHaveBeenCalledTimes(2);
            expect(prisma.$runCommandRaw.mock.calls[1][0]).toMatchObject({
                getMore: 42,
                collection: 'UsageCounter',
            });
            expect(result).toEqual([
                { bucket: 'day:2026-07-04', value: 5 },
                { bucket: 'day:2026-07-05', value: 14 },
            ]);
        });

        it('rejects a missing integrationType', async () => {
            await expect(
                repo.series({ metric: 'm', bucket: 'day' })
            ).rejects.toThrow(/integrationType/i);
        });
    });
});
