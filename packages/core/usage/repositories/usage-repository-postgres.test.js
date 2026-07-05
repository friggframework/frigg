jest.mock('../../database/prisma', () => ({
    prisma: {
        usageCounter: {
            upsert: jest.fn(),
            groupBy: jest.fn(),
            findMany: jest.fn(),
        },
    },
}));

const { prisma } = require('../../database/prisma');
const { UsageRepositoryPostgres } = require('./usage-repository-postgres');

describe('UsageRepositoryPostgres', () => {
    let repo;
    beforeEach(() => {
        jest.clearAllMocks();
        repo = new UsageRepositoryPostgres();
    });

    describe('increment', () => {
        it('upserts with an atomic value increment keyed by the compound unique', async () => {
            prisma.usageCounter.upsert.mockResolvedValue({});

            await repo.increment({
                integrationId: 'int_1',
                integrationType: 'hubspot',
                metric: 'records.synced',
                window: 'day:2026-07-05',
                value: 3,
            });

            expect(prisma.usageCounter.upsert).toHaveBeenCalledTimes(1);
            const arg = prisma.usageCounter.upsert.mock.calls[0][0];
            expect(arg.where).toEqual({
                integrationId_integrationType_metric_window: {
                    integrationId: 'int_1',
                    integrationType: 'hubspot',
                    metric: 'records.synced',
                    window: 'day:2026-07-05',
                },
            });
            expect(arg.create).toMatchObject({
                integrationId: 'int_1',
                integrationType: 'hubspot',
                metric: 'records.synced',
                window: 'day:2026-07-05',
                value: 3,
            });
            expect(arg.update).toEqual({ value: { increment: 3 } });
        });

        it('defaults value to 1 when omitted', async () => {
            prisma.usageCounter.upsert.mockResolvedValue({});
            await repo.increment({
                integrationId: 'i',
                integrationType: 't',
                metric: 'm',
                window: 'w',
            });
            const arg = prisma.usageCounter.upsert.mock.calls[0][0];
            expect(arg.create.value).toBe(1);
            expect(arg.update).toEqual({ value: { increment: 1 } });
        });

        it('retries once on a P2002 unique-violation race', async () => {
            const p2002 = Object.assign(new Error('unique'), {
                code: 'P2002',
            });
            prisma.usageCounter.upsert
                .mockRejectedValueOnce(p2002)
                .mockResolvedValueOnce({});

            await expect(
                repo.increment({
                    integrationId: 'i',
                    integrationType: 't',
                    metric: 'm',
                    window: 'w',
                    value: 2,
                })
            ).resolves.toBeUndefined();

            expect(prisma.usageCounter.upsert).toHaveBeenCalledTimes(2);
        });
    });

    describe('totals', () => {
        it('sums a SINGLE window granularity so day+hour rows are not double-counted', async () => {
            prisma.usageCounter.groupBy.mockResolvedValue([
                { integrationType: 'hubspot', _sum: { value: 12 } },
                { integrationType: 'salesforce', _sum: { value: 4 } },
            ]);
            const since = new Date('2026-07-01T00:00:00Z');

            const result = await repo.totals({
                metric: 'records.synced',
                groupBy: 'integrationType',
                since,
            });

            const arg = prisma.usageCounter.groupBy.mock.calls[0][0];
            expect(arg.by).toEqual(['integrationType']);
            // default bucket 'day' — the double-count fix
            expect(arg.where).toEqual({
                metric: 'records.synced',
                window: { startsWith: 'day:' },
                updatedAt: { gte: since },
            });
            expect(result).toEqual([
                { integrationType: 'hubspot', value: 12 },
                { integrationType: 'salesforce', value: 4 },
            ]);
        });

        it('rejects an un-allowlisted groupBy', async () => {
            await expect(
                repo.totals({ metric: 'm', groupBy: 'userId' })
            ).rejects.toThrow(/groupBy/i);
        });

        it('rejects an un-allowlisted bucket', async () => {
            await expect(
                repo.totals({ metric: 'm', bucket: 'year' })
            ).rejects.toThrow(/bucket/i);
        });
    });

    describe('series', () => {
        it('aggregates across integration instances into one point per window, range-filtered on the window key', async () => {
            prisma.usageCounter.groupBy.mockResolvedValue([
                { window: 'day:2026-07-04', _sum: { value: 5 } },
                { window: 'day:2026-07-05', _sum: { value: 14 } },
            ]);

            const result = await repo.series({
                metric: 'records.synced',
                integrationType: 'hubspot',
                from: new Date('2026-07-01T00:00:00Z'),
                to: new Date('2026-07-05T00:00:00Z'),
                bucket: 'day',
            });

            const arg = prisma.usageCounter.groupBy.mock.calls[0][0];
            expect(arg.by).toEqual(['window']);
            expect(arg.where).toMatchObject({
                metric: 'records.synced',
                integrationType: 'hubspot',
                window: {
                    startsWith: 'day:',
                    gte: 'day:2026-07-01',
                    lte: 'day:2026-07-05',
                },
            });
            expect(arg.where.updatedAt).toBeUndefined();
            expect(result).toEqual([
                { bucket: 'day:2026-07-04', value: 5 },
                { bucket: 'day:2026-07-05', value: 14 },
            ]);
        });

        it('rejects a missing integrationType (would silently mix types)', async () => {
            await expect(
                repo.series({ metric: 'm', bucket: 'day' })
            ).rejects.toThrow(/integrationType/i);
        });

        it('rejects an un-allowlisted bucket', async () => {
            await expect(
                repo.series({
                    metric: 'm',
                    integrationType: 't',
                    bucket: 'week',
                })
            ).rejects.toThrow(/bucket/i);
        });
    });

    describe('totals — requires a metric', () => {
        it('rejects an absent metric (would sum across mixed-unit metrics)', async () => {
            await expect(repo.totals({})).rejects.toThrow(/metric/i);
        });
    });
});
