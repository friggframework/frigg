jest.mock('../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
}));

const { IntegrationBase } = require('../integration-base');
const { desiredSchedules, scheduleJobId } = require('../schedules');
const { MockSchedulerAdapter } = require('../../infrastructure/scheduler/mock-scheduler-adapter');
const { createSchedulerCommands } = require('../../application/commands/scheduler-commands');

const QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/123456789012/poller-queue';

describe('desiredSchedules', () => {
    const entry = (over = {}) => ({ key: 'POLL', default: { every: '1h' }, configurable: { min: '15m' }, ...over });

    it('uses the default, or the installation\'s choice where the definition allows it', () => {
        expect(desiredSchedules({ integrationName: 'poller', integrationId: 'i1', entries: [entry()] }).desired).toEqual([
            { key: 'POLL', jobId: 'poller-i1-poll', event: 'POLL', recurrence: { every: '1h' }, payload: { integrationId: 'i1', scheduleKey: 'POLL' }, enabled: true, source: 'definition' },
        ]);
        const chosen = desiredSchedules({ integrationName: 'poller', integrationId: 'i1', entries: [entry({ choice: { cron: '0 9 * * 1-5', timezone: 'Europe/London' } })] });
        expect(chosen.desired[0]).toMatchObject({ recurrence: { cron: '0 9 * * 1-5', timezone: 'Europe/London' }, source: 'installation' });
        expect(chosen.problems).toEqual([]);
    });

    it('keeps the default and reports it when a choice breaks the floor or the schedule is fixed', () => {
        const tooFast = desiredSchedules({ integrationName: 'poller', integrationId: 'i1', entries: [entry({ choice: { every: '5m' } })] });
        expect(tooFast.desired[0]).toMatchObject({ recurrence: { every: '1h' }, source: 'definition' });
        expect(tooFast.problems).toEqual([{ key: 'POLL', problems: ['Runs every 5 minutes at its most frequent; the minimum is 15m'] }]);
        const fixed = desiredSchedules({ integrationName: 'poller', integrationId: 'i1', entries: [entry({ configurable: false, choice: { every: '30m' } })] });
        expect(fixed.desired[0].recurrence).toEqual({ every: '1h' });
        expect(fixed.problems).toEqual([{ key: 'POLL', problems: ['This schedule is not configurable'] }]);
    });

    it('lets a configurable schedule be paused by the installation, and only then', () => {
        expect(desiredSchedules({ integrationName: 'p', integrationId: 1, entries: [entry({ choice: { enabled: false } })] }).desired[0].enabled).toBe(false);
        expect(desiredSchedules({ integrationName: 'p', integrationId: 1, entries: [entry({ configurable: false, choice: { enabled: false } })] }).desired[0].enabled).toBe(true);
    });

    it('builds host-safe names within 64 characters that stay unique', () => {
        expect(scheduleJobId('hubspot', 42, 'ONGOING_SYNC')).toBe('hubspot-42-ongoing_sync');
        const long = scheduleJobId('integration-runtime', '65f1c0ffee0000000000abcd', 'SYNC_A_VERY_LONG_SYNC_IDENTIFIER_THAT_GOES_ON_ONGOING');
        const other = scheduleJobId('integration-runtime', '65f1c0ffee0000000000abcd', 'SYNC_A_VERY_LONG_SYNC_IDENTIFIER_THAT_GOES_ON_ONGOING_2');
        expect(long.length).toBeLessThanOrEqual(64);
        expect(long).not.toBe(other);
        expect(long).toMatch(/^[0-9A-Za-z_.-]+$/);
        expect(scheduleJobId('a b', 'c/d', 'E:F')).toBe('a-b-c-d-e-f');
    });
});

describe('IntegrationBase recurring schedules', () => {
    let service, integration;

    class Poller extends IntegrationBase {
        static Definition = {
            name: 'poller',
            version: '1.0.0',
            modules: {},
            schedules: {
                ONGOING_SYNC: { every: '1h', configurable: { min: '15m' } },
                DAILY_DIGEST: { cron: '0 8 * * 1-5', timezone: 'America/New_York' },
            },
        };
    }

    beforeEach(() => {
        jest.spyOn(console, 'log').mockImplementation(() => {});
        process.env.POLLER_QUEUE_URL = QUEUE_URL;
        service = new MockSchedulerAdapter();
        integration = new Poller();
        integration.id = 'int-1';
        integration.status = 'IN_CREATION';
        integration.config = {};
        integration.schedulerCommands = createSchedulerCommands({ integrationName: 'poller', schedulerService: service });
        integration.updateIntegrationStatus = { execute: jest.fn().mockResolvedValue(true) };
        integration.updateIntegrationMessages = { execute: jest.fn().mockResolvedValue(true) };
        integration.patchIntegrationConfig = { execute: jest.fn(async (id, patch) => ({ config: (integration.config = { ...integration.config, ...patch }) })) };
        integration.getConfigOptions = jest.fn().mockResolvedValue({ jsonSchema: {}, uiSchema: {} });
    });
    afterEach(() => { jest.restoreAllMocks(); delete process.env.POLLER_QUEUE_URL; });

    it('onCreate creates one schedule per declared entry for this installation and records them on config', async () => {
        await integration.onCreate();
        const schedules = service._getSchedules();
        expect(Object.keys(schedules).sort()).toEqual(['poller-int-1-daily_digest', 'poller-int-1-ongoing_sync']);
        expect(schedules['poller-int-1-daily_digest'].recurrence).toEqual({ cron: '0 8 * * 1-5', timezone: 'America/New_York' });
        expect(service._simulateTrigger('poller-int-1-ongoing_sync', { id: 'x', scheduledFor: 't' })).toMatchObject({ event: 'ONGOING_SYNC', data: { integrationId: 'int-1', scheduleKey: 'ONGOING_SYNC' } });
        expect(integration.config.runtime.schedules).toEqual({
            ONGOING_SYNC: expect.objectContaining({ jobId: 'poller-int-1-ongoing_sync', recurrence: { every: '1h' }, event: 'ONGOING_SYNC' }),
            DAILY_DIGEST: expect.objectContaining({ jobId: 'poller-int-1-daily_digest' }),
        });
    });

    it('onUpdate applies the installation\'s own interval, and refuses one below the floor with a warning', async () => {
        await integration.onCreate();
        await integration.onUpdate({ config: { schedules: { ONGOING_SYNC: { every: '20m' } } } });
        expect(service._getSchedules()['poller-int-1-ongoing_sync'].recurrence).toEqual({ every: '20m' });

        await integration.onUpdate({ config: { schedules: { ONGOING_SYNC: { every: '1m' }, DAILY_DIGEST: { cron: '0 * * * *' } } } });
        expect(service._getSchedules()['poller-int-1-ongoing_sync'].recurrence).toEqual({ every: '1h' });    // back to the default
        expect(service._getSchedules()['poller-int-1-daily_digest'].recurrence.cron).toBe('0 8 * * 1-5');     // fixed
        const warnings = integration.updateIntegrationMessages.execute.mock.calls.map((c) => c[3]);
        expect(warnings).toEqual([
            'ONGOING_SYNC: Runs every 1 minute at its most frequent; the minimum is 15m',
            'DAILY_DIGEST: This schedule is not configurable',
        ]);
    });

    it('onDelete removes every recorded schedule, including one the code no longer declares', async () => {
        await integration.onCreate();
        integration.config.runtime.schedules.LEGACY = { jobId: 'poller-int-1-legacy', recurrence: { every: '1d' }, event: 'LEGACY' };
        await service.upsertRecurring({ scheduleName: 'poller-int-1-legacy', recurrence: { every: '1d' }, queueResourceId: 'arn:q', payload: {} });
        await integration.onDelete();
        expect(service._getSchedules()).toEqual({});
        expect(integration.config.runtime.schedules).toEqual({});
    });

    it('a schedule the host refuses stays unrecorded and is logged; the lifecycle carries on', async () => {
        jest.spyOn(service, 'upsertRecurring').mockRejectedValue(new Error('AccessDenied'));
        const error = jest.spyOn(integration.logger, 'error').mockImplementation(() => {});
        await integration.onCreate();
        expect(integration.updateIntegrationStatus.execute).toHaveBeenCalledWith('int-1', 'ENABLED');
        expect(integration.config.runtime).toBeUndefined();
        expect(error).toHaveBeenCalledWith('Schedules not reconciled', expect.objectContaining({ eventName: expect.stringMatching(/schedules_failed$/) }));
    });

    it('does nothing at all for an integration with no schedules', async () => {
        class Plain extends IntegrationBase { static Definition = { name: 'plain', version: '1.0.0', modules: {} }; }
        const plain = new Plain();
        plain.id = 'p1';
        plain.config = {};
        plain.patchIntegrationConfig = { execute: jest.fn() };
        expect(await plain.syncSchedules()).toBeNull();
        expect(await plain.syncSchedules({ remove: true })).toBeNull();
        expect(plain.patchIntegrationConfig.execute).not.toHaveBeenCalled();
    });
});
