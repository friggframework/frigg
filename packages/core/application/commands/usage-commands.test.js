const { createUsageCommands } = require('./usage-commands');

function fakeRepo() {
    return {
        increment: jest.fn().mockResolvedValue(undefined),
        totals: jest
            .fn()
            .mockResolvedValue([{ integrationType: 'hubspot', value: 5 }]),
        series: jest
            .fn()
            .mockResolvedValue([{ bucket: 'day:2026-07-05', value: 5 }]),
    };
}

describe('createUsageCommands (ADR-011 §5 read contract)', () => {
    it('recordUsageCounter derives day+hour windows from a timestamp and increments both', async () => {
        const repo = fakeRepo();
        const cmds = createUsageCommands({ usageRepository: repo });

        await cmds.recordUsageCounter({
            integrationId: 'int_1',
            integrationType: 'hubspot',
            metric: 'records.synced',
            value: 4,
            at: new Date('2026-07-05T14:23:00.000Z'),
        });

        expect(repo.increment).toHaveBeenCalledTimes(2);
        const windows = repo.increment.mock.calls.map((c) => c[0].window);
        expect(windows).toEqual(
            expect.arrayContaining(['day:2026-07-05', 'hour:2026-07-05T14'])
        );
        expect(repo.increment).toHaveBeenCalledWith(
            expect.objectContaining({
                integrationId: 'int_1',
                integrationType: 'hubspot',
                metric: 'records.synced',
                value: 4,
            })
        );
    });

    it('totals delegates to the repository and returns its rows', async () => {
        const repo = fakeRepo();
        const cmds = createUsageCommands({ usageRepository: repo });

        const result = await cmds.totals({
            metric: 'records.synced',
            groupBy: 'integrationType',
        });

        expect(repo.totals).toHaveBeenCalledWith({
            metric: 'records.synced',
            groupBy: 'integrationType',
        });
        expect(result).toEqual([{ integrationType: 'hubspot', value: 5 }]);
    });

    it('series delegates to the repository', async () => {
        const repo = fakeRepo();
        const cmds = createUsageCommands({ usageRepository: repo });

        await cmds.series({
            metric: 'records.synced',
            integrationType: 'hubspot',
            bucket: 'day',
        });

        expect(repo.series).toHaveBeenCalledWith({
            metric: 'records.synced',
            integrationType: 'hubspot',
            bucket: 'day',
        });
    });
});

describe('createUsageCommands — North Star read (ADR-011 Decision 5)', () => {
    it('northStar() resolves the configured default counter and returns its totals', async () => {
        const repo = fakeRepo();
        const cmds = createUsageCommands({
            usageRepository: repo,
            northStar: { default: { name: 'records.synced' } },
        });

        const since = new Date('2026-01-01T00:00:00.000Z');
        const result = await cmds.northStar({
            integrationType: 'hubspot',
            since,
        });

        expect(repo.totals).toHaveBeenCalledWith(
            expect.objectContaining({ metric: 'records.synced', since })
        );
        expect(result).toEqual({
            metric: 'records.synced',
            totals: [{ integrationType: 'hubspot', value: 5 }],
        });
    });

    it('northStar() prefers a byType counter over the default for that type', async () => {
        const repo = fakeRepo();
        const cmds = createUsageCommands({
            usageRepository: repo,
            northStar: {
                default: { name: 'records.synced' },
                byType: { crm: { name: 'contacts.synced' } },
            },
        });

        const result = await cmds.northStar({ integrationType: 'crm' });

        expect(repo.totals).toHaveBeenCalledWith(
            expect.objectContaining({ metric: 'contacts.synced' })
        );
        expect(result.metric).toBe('contacts.synced');
    });

    it('northStar() returns null when no North Star is configured', async () => {
        const repo = fakeRepo();
        const cmds = createUsageCommands({ usageRepository: repo });

        const result = await cmds.northStar({ integrationType: 'hubspot' });

        expect(result).toBeNull();
        expect(repo.totals).not.toHaveBeenCalled();
    });
});
