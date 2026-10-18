/**
 * Recurring schedules: the host-neutral recurrence, its EventBridge translation, the adapters' upsert, and the
 * reconcile command that keeps one installation's schedules in step with what it should have.
 */
const {
    parseEvery,
    minGapMinutes,
    validateRecurrence,
    recurrenceKey,
} = require('../recurrence');
const { MockSchedulerAdapter } = require('../mock-scheduler-adapter');
const { TICK, fillTick } = require('../scheduler-service-interface');
const { createSchedulerCommands } = require('../../../application/commands/scheduler-commands');

jest.mock('@aws-sdk/client-scheduler', () => {
    class Named extends Error { constructor(m) { super(m); this.name = this.constructor.name; } }
    class ResourceNotFoundException extends Named {}
    class ConflictException extends Named {}
    const command = (type) => class { constructor(input) { this.type = type; this.input = input; } };
    return {
        SchedulerClient: class { constructor() { this.sent = []; this.respond = async () => ({ ScheduleArn: 'arn:x' }); } async send(c) { this.sent.push(c); return this.respond(c); } },
        CreateScheduleCommand: command('create'),
        UpdateScheduleCommand: command('update'),
        DeleteScheduleCommand: command('delete'),
        GetScheduleCommand: command('get'),
        ResourceNotFoundException,
        ConflictException,
    };
});
const { ResourceNotFoundException, ConflictException } = require('@aws-sdk/client-scheduler');
const { EventBridgeSchedulerAdapter, toEventBridgeExpression } = require('../eventbridge-scheduler-adapter');

const QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/123456789012/hubspot-queue';
const QUEUE_ARN = 'arn:aws:sqs:us-east-1:123456789012:hubspot-queue';

describe('recurrence (host-neutral)', () => {
    it('reads every as minutes, hours or days and nothing else', () => {
        expect([parseEvery('15m'), parseEvery('2h'), parseEvery('1d'), parseEvery(' 90 m ')]).toEqual([15, 120, 1440, 90]);
        for (const bad of ['30s', '0m', '1w', '', null, 'm15', '1.5h']) expect(parseEvery(bad)).toBeNull();
    });

    it('measures the shortest real gap of a cron, including the wrap into the next hour and day', () => {
        expect(minGapMinutes({ cron: '*/15 * * * *' })).toBe(15);
        expect(minGapMinutes({ cron: '*/7 * * * *' })).toBe(4);         // :56 -> :00
        expect(minGapMinutes({ cron: '5,50 * * * *' })).toBe(15);       // :50 -> :05
        expect(minGapMinutes({ cron: '0 */2 * * *' })).toBe(120);
        expect(minGapMinutes({ cron: '0 9 * * 1-5' })).toBe(1440);
        expect(minGapMinutes({ cron: '0 23,1 * * *' })).toBe(120);      // 23:00 -> 01:00 next day
        expect(minGapMinutes({ cron: '0 0 * * 0,7' })).toBe(10080);    // 0 and 7 are both Sunday
        expect(minGapMinutes({ every: '45m' })).toBe(45);
    });

    it('refuses what no host can run: bad fields, both day fields, a cron that never fires, an unknown time zone', () => {
        expect(validateRecurrence({ cron: '0 9 * *' })).toEqual([expect.stringMatching(/five fields/)]);
        expect(validateRecurrence({ cron: '60 * * * *' })).toEqual([expect.stringMatching(/minute.*out of range/)]);
        expect(validateRecurrence({ cron: '0 9 1 * MON' })).toEqual(['Restrict day of month or day of week, not both']);
        expect(validateRecurrence({ cron: '0 9 31 2 *' })).toEqual(['"0 9 31 2 *" never fires']);
        expect(validateRecurrence({ cron: '0 9 * * *', timezone: 'Mars/Base' })).toEqual(['Unknown time zone "Mars/Base"']);
        expect(validateRecurrence({ every: '1h', timezone: 'UTC' })).toEqual(['timezone applies to cron schedules only']);
        expect(validateRecurrence({ every: '1h', cron: '0 * * * *' })).toEqual(['Give exactly one of every or cron']);
        expect(validateRecurrence({ cron: '0 9 * * 1-5', timezone: 'America/New_York' })).toEqual([]);
    });

    it('holds a schedule to a floor by what it does, not how it is spelled', () => {
        expect(validateRecurrence({ every: '10m' }, { min: '15m' })).toEqual(['Runs every 10 minutes at its most frequent; the minimum is 15m']);
        expect(validateRecurrence({ cron: '0,5 * * * *' }, { min: '15m' })).toEqual(['Runs every 5 minutes at its most frequent; the minimum is 15m']);
        expect(validateRecurrence({ cron: '*/15 * * * *' }, { min: '15m' })).toEqual([]);
        expect(validateRecurrence({ every: '1h' }, { min: '1h' })).toEqual([]);
    });

    it('gives equal recurrences equal keys, so a reconcile does not rewrite an unchanged schedule', () => {
        expect(recurrenceKey({ every: '60m' })).toBe(recurrenceKey({ every: '1h' }));
        expect(recurrenceKey({ cron: '0  9 * * *' })).toBe(recurrenceKey({ cron: '0 9 * * *', timezone: 'UTC' }));
        expect(recurrenceKey({ cron: '0 9 * * *', timezone: 'Europe/London' })).not.toBe(recurrenceKey({ cron: '0 9 * * *' }));
    });

    it('fills tick placeholders deeply and leaves everything else alone', () => {
        const out = fillTick({ a: TICK.id, b: [TICK.scheduledFor, 'x'], c: { d: TICK.id, e: 1 } }, { id: 'I', scheduledFor: 'T' });
        expect(out).toEqual({ a: 'I', b: ['T', 'x'], c: { d: 'I', e: 1 } });
    });
});

describe('EventBridge translation', () => {
    it('uses rate() in the largest whole unit and cron() with six fields, ? and weekday names', () => {
        expect(toEventBridgeExpression({ every: '15m' })).toBe('rate(15 minutes)');
        expect(toEventBridgeExpression({ every: '60m' })).toBe('rate(1 hour)');
        expect(toEventBridgeExpression({ every: '2d' })).toBe('rate(2 days)');
        expect(toEventBridgeExpression({ every: '90m' })).toBe('rate(90 minutes)');
        expect(toEventBridgeExpression({ cron: '*/15 * * * *' })).toBe('cron(*/15 * * * ? *)');
        expect(toEventBridgeExpression({ cron: '0 0 1 * *' })).toBe('cron(0 0 1 * ? *)');
        // cron's 1-5 is Monday-Friday; EventBridge would read 1-5 as Sunday-Thursday, so names are written.
        expect(toEventBridgeExpression({ cron: '0 9 * * 1-5' })).toBe('cron(0 9 ? * MON,TUE,WED,THU,FRI *)');
        expect(toEventBridgeExpression({ cron: '0 8 * JAN-MAR 0' })).toBe('cron(0 8 ? JAN-MAR SUN *)');
    });

    it('throws on a recurrence it cannot express rather than creating a wrong schedule', () => {
        expect(() => toEventBridgeExpression({ cron: '0 9 1 * MON' })).toThrow(/not both/);
    });
});

describe('EventBridgeSchedulerAdapter.upsertRecurring', () => {
    let adapter;
    beforeEach(() => {
        process.env.SCHEDULER_ROLE_ARN = 'arn:aws:iam::123456789012:role/scheduler';
        adapter = new EventBridgeSchedulerAdapter({ region: 'us-east-1' });
    });

    const recurring = { scheduleName: 'hubspot-int1-sync', recurrence: { cron: '0 9 * * 1-5', timezone: 'America/New_York' }, queueResourceId: QUEUE_ARN, payload: { event: 'SYNC', data: { tick: { id: TICK.id, scheduledFor: TICK.scheduledFor } } } };

    it('updates an existing schedule: expression, zone, state, and per-firing context attributes in the input', async () => {
        const out = await adapter.upsertRecurring({ ...recurring, enabled: false });
        expect(out).toEqual({ scheduledJobId: 'arn:x', created: false });
        expect(adapter.client.sent.map((c) => c.type)).toEqual(['update']);
        const input = adapter.client.sent[0].input;
        expect(input).toMatchObject({ Name: 'hubspot-int1-sync', ScheduleExpression: 'cron(0 9 ? * MON,TUE,WED,THU,FRI *)', ScheduleExpressionTimezone: 'America/New_York', State: 'DISABLED', FlexibleTimeWindow: { Mode: 'OFF' } });
        expect(input.ActionAfterCompletion).toBeUndefined();   // a recurring schedule must not delete itself
        expect(JSON.parse(input.Target.Input).data.tick).toEqual({ id: '<aws.scheduler.execution-id>', scheduledFor: '<aws.scheduler.scheduled-time>' });
    });

    it('creates it when it does not exist', async () => {
        adapter.client.respond = async (c) => { if (c.type === 'update') throw new ResourceNotFoundException('nope'); return { ScheduleArn: 'arn:new' }; };
        expect(await adapter.upsertRecurring(recurring)).toEqual({ scheduledJobId: 'arn:new', created: true });
        expect(adapter.client.sent.map((c) => c.type)).toEqual(['update', 'create']);
        expect(adapter.client.sent[1].input.State).toBe('ENABLED');
    });

    it('updates after losing a create race to a concurrent writer', async () => {
        let updates = 0;
        adapter.client.respond = async (c) => {
            if (c.type === 'update' && updates++ === 0) throw new ResourceNotFoundException('nope');
            if (c.type === 'create') throw new ConflictException('exists');
            return { ScheduleArn: 'arn:raced' };
        };
        expect(await adapter.upsertRecurring(recurring)).toEqual({ scheduledJobId: 'arn:raced', created: false });
        expect(adapter.client.sent.map((c) => c.type)).toEqual(['update', 'create', 'update']);
    });

    it('rate schedules always run in UTC; other errors propagate', async () => {
        await adapter.upsertRecurring({ ...recurring, recurrence: { every: '1h' } });
        expect(adapter.client.sent[0].input).toMatchObject({ ScheduleExpression: 'rate(1 hour)', ScheduleExpressionTimezone: 'UTC' });
        adapter.client.respond = async () => { throw new Error('AccessDenied'); };
        await expect(adapter.upsertRecurring(recurring)).rejects.toThrow('AccessDenied');
    });
});

describe('scheduler commands: recurring jobs', () => {
    let service, commands;
    const desired = (overrides = {}) => ({ key: 'SYNC', jobId: 'hubspot-int1-sync', recurrence: { every: '1h' }, event: 'SYNC', payload: { integrationId: 'int1' }, ...overrides });
    beforeEach(() => {
        jest.spyOn(console, 'log').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        service = new MockSchedulerAdapter();
        commands = createSchedulerCommands({ integrationName: 'hubspot', schedulerService: service });
    });
    afterEach(() => jest.restoreAllMocks());

    it('sends { event, data: { ...payload, tick } } to the queue ARN on every firing', async () => {
        const res = await commands.upsertRecurringJob({ jobId: 'j1', recurrence: { every: '15m' }, event: 'POLL', payload: { integrationId: 'int1' }, queueUrl: QUEUE_URL });
        expect(res).toMatchObject({ jobId: 'j1', created: true });
        const stored = service._getSchedules().j1;
        expect(stored.queueResourceId).toBe(QUEUE_ARN);
        expect(service._simulateTrigger('j1', { id: 'exec-1', scheduledFor: '2026-10-18T09:00:00Z' })).toEqual({
            event: 'POLL', integrationName: 'hubspot', scheduleName: 'j1',
            data: { integrationId: 'int1', tick: { id: 'exec-1', scheduledFor: '2026-10-18T09:00:00Z' } },
        });
    });

    it('refuses an invalid recurrence as INVALID_JOB_DATA (400) without touching the host', async () => {
        const res = await commands.upsertRecurringJob({ jobId: 'j1', recurrence: { every: '30s' }, event: 'POLL', queueUrl: QUEUE_URL });
        expect(res).toMatchObject({ error: 400, code: 'INVALID_JOB_DATA' });
        expect(service._getSchedules()).toEqual({});
    });

    it('reconcile: creates, leaves an unchanged schedule alone, updates a changed one, deletes a dropped one', async () => {
        const first = await commands.reconcileRecurringJobs({ desired: [desired(), desired({ key: 'DIGEST', jobId: 'hubspot-int1-digest', recurrence: { cron: '0 8 * * *' }, event: 'DIGEST' })], stored: {}, queueUrl: QUEUE_URL });
        expect(first).toMatchObject({ created: ['SYNC', 'DIGEST'], updated: [], deleted: [], failed: [] });
        expect(first.stored.SYNC).toMatchObject({ jobId: 'hubspot-int1-sync', recurrence: { every: '1h' }, event: 'SYNC', enabled: true });

        const upsert = jest.spyOn(service, 'upsertRecurring');
        const second = await commands.reconcileRecurringJobs({ desired: [desired({ recurrence: { every: '60m' } })], stored: first.stored, queueUrl: QUEUE_URL });
        expect(second).toMatchObject({ unchanged: ['SYNC'], deleted: ['DIGEST'], created: [], updated: [] });
        expect(upsert).not.toHaveBeenCalled();                   // 60m is 1h: nothing to write
        expect(Object.keys(service._getSchedules())).toEqual(['hubspot-int1-sync']);

        const third = await commands.reconcileRecurringJobs({ desired: [desired({ recurrence: { every: '30m' }, enabled: false })], stored: second.stored, queueUrl: QUEUE_URL });
        expect(third.updated).toEqual(['SYNC']);
        expect(service._getSchedules()['hubspot-int1-sync']).toMatchObject({ recurrence: { every: '30m' }, state: 'DISABLED' });
        expect(third.stored).toEqual({ SYNC: expect.objectContaining({ recurrence: { every: '30m' }, enabled: false }) });
    });

    it('reconcile: a failed write leaves the stored entry as it was, so the next reconcile retries it', async () => {
        const first = await commands.reconcileRecurringJobs({ desired: [desired()], stored: {}, queueUrl: QUEUE_URL });
        jest.spyOn(service, 'upsertRecurring').mockRejectedValueOnce(new Error('throttled'));
        const second = await commands.reconcileRecurringJobs({ desired: [desired({ recurrence: { every: '2h' } })], stored: first.stored, queueUrl: QUEUE_URL });
        expect(second.failed).toEqual([{ key: 'SYNC', reason: 'throttled' }]);
        expect(second.stored).toEqual(first.stored);
        const third = await commands.reconcileRecurringJobs({ desired: [desired({ recurrence: { every: '2h' } })], stored: second.stored, queueUrl: QUEUE_URL });
        expect(third.updated).toEqual(['SYNC']);

        jest.spyOn(service, 'deleteSchedule').mockRejectedValueOnce(new Error('denied'));
        const fourth = await commands.reconcileRecurringJobs({ desired: [], stored: third.stored, queueUrl: QUEUE_URL });
        expect(fourth.failed).toEqual([{ key: 'SYNC', reason: 'denied' }]);
        expect(fourth.stored).toEqual(third.stored);              // still recorded: the host still holds it
    });

    it('reconcile: a renamed job is created under the new name and the old one deleted', async () => {
        const first = await commands.reconcileRecurringJobs({ desired: [desired()], stored: {}, queueUrl: QUEUE_URL });
        const second = await commands.reconcileRecurringJobs({ desired: [desired({ jobId: 'hubspot-int1-sync-v2' })], stored: first.stored, queueUrl: QUEUE_URL });
        expect(second.updated).toEqual(['SYNC']);
        expect(Object.keys(service._getSchedules())).toEqual(['hubspot-int1-sync-v2']);
    });

    it('reconcile without a scheduler records nothing and says so', async () => {
        const unconfigured = createSchedulerCommands({ integrationName: 'hubspot' });
        process.env.SCHEDULER_PROVIDER = 'nope';
        try {
            const out = await unconfigured.reconcileRecurringJobs({ desired: [desired()], stored: {}, queueUrl: QUEUE_URL });
            expect(out).toMatchObject({ warning: 'Scheduler not configured', stored: {}, created: [] });
        } finally { delete process.env.SCHEDULER_PROVIDER; }
    });

    it('the methods work detached from the commands object', async () => {
        const { reconcileRecurringJobs } = commands;
        const out = await reconcileRecurringJobs({ desired: [desired()], stored: {}, queueUrl: QUEUE_URL });
        expect(out.created).toEqual(['SYNC']);
    });
});
