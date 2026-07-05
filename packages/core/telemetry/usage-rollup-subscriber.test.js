const { createUsageRollupSubscriber } = require('./usage-rollup-subscriber');
const { createNoOpTelemetry } = require('./no-op-telemetry');

function harness(trackedMetrics) {
    const telemetry = createNoOpTelemetry();
    const increments = [];
    const usageRepository = {
        increment: jest.fn(async (args) => {
            increments.push(args);
        }),
    };
    const subscriber = createUsageRollupSubscriber({
        telemetry,
        usageRepository,
        trackedMetrics: new Set(trackedMetrics),
        now: () => new Date('2026-07-05T14:23:00.000Z'),
    });
    return { telemetry, usageRepository, increments, subscriber };
}

describe('usage rollup subscriber (ADR-011 P9)', () => {
    it('rolls an explicit tracked counter into day + hour windows with per-integration context', async () => {
        const { telemetry, increments, subscriber } = harness([
            'records.synced',
        ]);

        telemetry.count(
            'records.synced',
            3,
            { entity: 'contact' },
            { integrationType: 'hubspot', integrationId: 'int_1' }
        );
        await subscriber.flush();

        expect(increments).toContainEqual({
            integrationId: 'int_1',
            integrationType: 'hubspot',
            metric: 'records.synced',
            window: 'day:2026-07-05',
            value: 3,
        });
        expect(increments).toContainEqual(
            expect.objectContaining({
                metric: 'records.synced',
                window: 'hour:2026-07-05T14',
                value: 3,
            })
        );
    });

    it('maps a framework signal to its canonical key and attributes by integration_type', async () => {
        const { telemetry, increments, subscriber } = harness(['api.requests']);

        telemetry.count('frigg.apimodule.requests', 1, {
            module: 'hubspotApi',
            method: 'GET',
            status: 'ok',
            integration_type: 'hubspot',
        });
        await subscriber.flush();

        expect(increments).toContainEqual(
            expect.objectContaining({
                integrationType: 'hubspot',
                integrationId: 'hubspot',
                metric: 'api.requests',
                window: 'day:2026-07-05',
                value: 1,
            })
        );
    });

    it('ignores metrics that do not resolve to a tracked key', async () => {
        const { telemetry, usageRepository, subscriber } = harness([
            'records.synced',
        ]);

        // handler.invocations for a CRON does not map to user_actions
        telemetry.count('frigg.handler.invocations', 1, {
            integration_type: 'hubspot',
            event: 'CRON',
            status: 'ok',
        });
        // api.requests not in tracked set
        telemetry.count('frigg.apimodule.requests', 1, {
            integration_type: 'hubspot',
        });
        await subscriber.flush();

        expect(usageRepository.increment).not.toHaveBeenCalled();
    });

    it('aggregates repeated events in the same window before flushing', async () => {
        const { telemetry, increments, subscriber } = harness([
            'records.synced',
        ]);
        const ctx = { integrationType: 'hubspot', integrationId: 'int_1' };

        telemetry.count('records.synced', 2, {}, ctx);
        telemetry.count('records.synced', 5, {}, ctx);
        await subscriber.flush();

        const day = increments.find((i) => i.window === 'day:2026-07-05');
        expect(day.value).toBe(7);
    });

    it('discard() drops the buffer without writing (SQS-redelivery guard)', async () => {
        const { telemetry, usageRepository, subscriber } = harness([
            'records.synced',
        ]);

        telemetry.count(
            'records.synced',
            9,
            {},
            { integrationType: 'hubspot', integrationId: 'int_1' }
        );
        subscriber.discard();
        await subscriber.flush();

        expect(usageRepository.increment).not.toHaveBeenCalled();
    });

    it('skips events with no resolvable integration type', async () => {
        const { telemetry, usageRepository, subscriber } = harness([
            'records.synced',
        ]);

        telemetry.count('records.synced', 1, {}); // no context, no integration_type
        await subscriber.flush();

        expect(usageRepository.increment).not.toHaveBeenCalled();
    });
});
