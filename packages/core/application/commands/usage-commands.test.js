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
    it('recordUsageCounter delegates to the repository increment', async () => {
        const repo = fakeRepo();
        const cmds = createUsageCommands({ usageRepository: repo });

        await cmds.recordUsageCounter({
            integrationId: 'int_1',
            integrationType: 'hubspot',
            metric: 'records.synced',
            window: 'day:2026-07-05',
            value: 4,
        });

        expect(repo.increment).toHaveBeenCalledWith({
            integrationId: 'int_1',
            integrationType: 'hubspot',
            metric: 'records.synced',
            window: 'day:2026-07-05',
            value: 4,
        });
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
