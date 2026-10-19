/**
 * The trigger runtime (ADR-055 §3): the tick that pages ENABLED installations and queues the runs that are due, and
 * the run on the queue worker (IntegrationBase.onTriggerRun with the RunTrigger use case). Persistence and SQS are
 * fakes that record what was asked of them; the due rules are the real ones.
 */
jest.mock('../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
}));

const { IntegrationBase } = require('../integration-base');
const { RunTriggerTick } = require('../use-cases/run-trigger-tick');
const { RunTrigger } = require('../use-cases/run-trigger');
const { IntegrationEventDispatcher } = require('../../handlers/integration-event-dispatcher');
const { hashId } = require('../triggers');

const QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/123456789012/poller-queue';
const at = (iso) => Date.parse(iso);

/** findIntegrations over an array, honouring type, status, limit and after the way the adapters do. */
function fakeRepository(rows) {
    const calls = [];
    return {
        calls,
        async findIntegrations({ type, status, limit, after } = {}) {
            calls.push({ type, status, limit, after });
            const sorted = rows.filter((r) => r.config.type === type && r.status === status).sort((a, b) => a.id - b.id);
            const rest = after === undefined ? sorted : sorted.filter((r) => r.id > after);
            return limit ? rest.slice(0, limit) : rest;
        },
    };
}

function fakeQueue() {
    const q = { batches: [], sent: [] };
    q.batchSend = async (entries, queueUrl, options = {}) => {
        q.batches.push({ queueUrl, entries: entries.map((e, i) => ({ ...e, delay: options.delaySeconds ? options.delaySeconds(e, i) : 0 })) });
    };
    q.send = async (message, queueUrl) => { q.sent.push({ message, queueUrl }); };
    q.runs = () => q.batches.flatMap((b) => b.entries);
    return q;
}

class Poller extends IntegrationBase {
    static Definition = {
        name: 'poller',
        modules: {},
        triggers: {
            poll: { every: '15m', handler: 'poll' },
            sync: { every: '1h', configurable: { min: '15m' }, when: (c) => c.syncOn !== false, handler: 'sync' },
            digest: { cron: '0 8 * * 1-5', timezone: 'America/New_York', tick: '15m', handler: 'digest' },
            nightly: { at: 'cron(0 3 * * ? *)', timezone: 'Europe/London', handler: 'nightly' },
        },
    };
}

const row = (id, config = {}, status = 'ENABLED') => ({ id, status, config: { type: 'poller', ...config } });

describe('RunTriggerTick', () => {
    const tick = (rows, opts = {}) => {
        const repository = fakeRepository(rows);
        const queue = fakeQueue();
        const useCase = new RunTriggerTick({ integrationClass: Poller, integrationRepository: repository, queue, queueUrl: QUEUE_URL, pageSize: opts.pageSize || 500 });
        return { repository, queue, useCase };
    };

    it('reads only ENABLED installations of this integration and queues FRIGG_TRIGGER_RUN for each due one', async () => {
        const rows = [row(1), row(2), row(3, {}, 'DISABLED'), { id: 4, status: 'ENABLED', config: { type: 'other' } }];
        const { repository, queue, useCase } = tick(rows);
        // Every 15m trigger is due at every 15m slot (cadence 1); sync (1h, cadence 4) only where the hash says.
        const out = await useCase.execute({ tick: '15m', time: '2026-10-19T12:00:07Z' });
        expect(repository.calls[0]).toEqual({ type: 'poller', status: 'ENABLED', limit: 500, after: undefined });
        const polls = queue.runs().filter((m) => m.data.trigger === 'poll');
        expect(polls.map((m) => m.data.integrationId)).toEqual([1, 2]);
        expect(polls[0]).toMatchObject({ event: 'FRIGG_TRIGGER_RUN', data: { integrationId: 1, trigger: 'poll', scheduledFor: '2026-10-19T12:00:00.000Z' } });
        expect(queue.batches.every((b) => b.queueUrl === QUEUE_URL)).toBe(true);
        expect(out).toMatchObject({ installations: 2, pages: 1, continued: false, failed: [] });
        // The digest fired at 08:00 New York (12:00Z), inside (11:45, 12:00]; nightly is not on this tick.
        expect(queue.runs().filter((m) => m.data.trigger === 'digest').map((m) => m.data.scheduledFor)).toEqual(['2026-10-19T12:00:00.000Z', '2026-10-19T12:00:00.000Z']);
        expect(queue.runs().some((m) => m.data.trigger === 'nightly')).toBe(false);
    });

    it('spreads a 1h trigger over the hour: over four 15m ticks each installation runs once, in its hash\'s slot', async () => {
        const rows = Array.from({ length: 40 }, (_, i) => row(i + 1));
        const { queue, useCase } = tick(rows);
        for (const t of ['12:00', '12:15', '12:30', '12:45']) await useCase.execute({ tick: '15m', time: `2026-10-19T${t}:00Z` });
        const syncs = queue.runs().filter((m) => m.data.trigger === 'sync');
        expect(syncs).toHaveLength(40);
        expect(new Set(syncs.map((m) => m.data.integrationId)).size).toBe(40);
        expect(new Set(syncs.map((m) => m.data.scheduledFor)).size).toBe(4);
    });

    it('honours each installation\'s chosen timing and `when`, and never a choice under the floor', async () => {
        const rows = [row(1, { triggers: { sync: { every: '15m' } } }), row(2, { syncOn: false }), row(3, { triggers: { sync: { every: '5m' } } })];
        const { queue, useCase } = tick(rows);
        for (const t of ['12:00', '12:15', '12:30', '12:45']) await useCase.execute({ tick: '15m', time: `2026-10-19T${t}:00Z` });
        const syncsOf = (id) => queue.runs().filter((m) => m.data.trigger === 'sync' && m.data.integrationId === id).length;
        expect(syncsOf(1)).toBe(4);     // chose every 15m
        expect(syncsOf(2)).toBe(0);     // `when` excludes it
        expect(syncsOf(3)).toBe(1);     // 5m is under the floor: the default hourly runs
    });

    it('decides the same for the same schedule time, wherever in the slot the tick runs', async () => {
        const rows = Array.from({ length: 20 }, (_, i) => row(i + 1));
        const a = tick(rows); const b = tick(rows);
        await a.useCase.execute({ tick: '15m', time: '2026-10-19T12:15:00Z' });
        await b.useCase.execute({ tick: '15m', time: '2026-10-19T12:29:59Z' });
        expect(b.queue.runs()).toEqual(a.queue.runs());
    });

    it('a tick runs only the triggers on that tick, so a 15m trigger is not run again by the 5m schedule', async () => {
        class Mixed extends Poller { static Definition = { ...Poller.Definition, triggers: { fast: { every: '5m', handler: 'poll' }, poll: { every: '15m', handler: 'poll' } } }; }
        const queue = fakeQueue();
        const useCase = () => new RunTriggerTick({ integrationClass: Mixed, integrationRepository: fakeRepository([row(1)]), queue, queueUrl: QUEUE_URL });
        await useCase().execute({ tick: '15m', time: '2026-10-19T12:00:00Z' });
        for (const t of ['12:00', '12:05', '12:10']) await useCase().execute({ tick: '5m', time: `2026-10-19T${t}:00Z` });
        expect(queue.runs().map((m) => m.data.trigger)).toEqual(['poll', 'fast', 'fast', 'fast']);
    });

    it('jitters runs within the tick by a stable delay, at most min(tick, 900 s)', async () => {
        const { queue, useCase } = tick([row(1), row(2)]);
        await useCase.execute({ tick: '15m', time: '2026-10-19T12:00:00Z' });
        for (const m of queue.runs()) {
            expect(m.delay).toBe(hashId(`${m.data.integrationId}:${m.data.trigger}`) % 900);
            expect(m.delay).toBeLessThan(900);
        }
    });

    it('an at trigger runs for every ENABLED installation that passes `when`, without jitter', async () => {
        const { queue, useCase } = tick([row(1), row(2), row(3, {}, 'ERROR')]);
        await useCase.execute({ at: 'nightly', time: '2026-10-19T02:00:13Z' });
        expect(queue.runs()).toEqual([1, 2].map((id) => ({ event: 'FRIGG_TRIGGER_RUN', data: { integrationId: id, trigger: 'nightly', scheduledFor: '2026-10-19T02:00:00.000Z' }, delay: 0 })));
    });

    it('pages by id until a short page, and hands its cursor to the queue when the deadline nears', async () => {
        const rows = Array.from({ length: 7 }, (_, i) => row(i + 1));
        const paged = tick(rows, { pageSize: 3 });
        const out = await paged.useCase.execute({ tick: '15m', time: '2026-10-19T12:00:00Z' });
        expect(paged.repository.calls.map((c) => c.after)).toEqual([undefined, 3, 6]);
        expect(out).toMatchObject({ installations: 7, pages: 3, continued: false });

        const hurried = tick(rows, { pageSize: 3 });
        const cut = await hurried.useCase.execute({ tick: '15m', time: '2026-10-19T12:00:00Z', remainingMs: () => 5000 });
        expect(cut).toMatchObject({ installations: 3, pages: 1, continued: true });
        expect(hurried.queue.sent).toEqual([{ queueUrl: QUEUE_URL, message: { event: 'FRIGG_TRIGGER_TICK', data: { tick: '15m', time: '2026-10-19T12:00:00.000Z', cursor: 3 } } }]);
        // The continuation decides the rest of the same slot.
        await hurried.useCase.execute({ ...hurried.queue.sent[0].message.data });
        expect(hurried.queue.runs()).toEqual(paged.queue.runs());
    });

    it('one installation\'s bad config does not stop the others', async () => {
        class Picky extends Poller {
            static Definition = { ...Poller.Definition, name: 'poller', triggers: { poll: { every: '15m', when: (c) => { if (c.broken) throw new Error('bad config'); return true; }, handler: 'poll' } } };
        }
        const repository = fakeRepository([row(1, { broken: true }), row(2)]);
        const queue = fakeQueue();
        const out = await new RunTriggerTick({ integrationClass: Picky, integrationRepository: repository, queue, queueUrl: QUEUE_URL }).execute({ tick: '15m', time: '2026-10-19T12:00:00Z' });
        expect(queue.runs().map((m) => m.data.integrationId)).toEqual([2]);
        expect(out.failed).toEqual([{ integrationId: 1, error: 'bad config' }]);
    });

    it('refuses to run without a queue or with a tick that is not a duration', async () => {
        const repository = fakeRepository([]);
        await expect(new RunTriggerTick({ integrationClass: Poller, integrationRepository: repository, queue: fakeQueue() }).execute({ tick: '15m' })).rejects.toThrow(/No queue URL/);
        await expect(new RunTriggerTick({ integrationClass: Poller, integrationRepository: repository, queue: fakeQueue(), queueUrl: QUEUE_URL }).execute({ tick: 'soon' })).rejects.toThrow(/not a duration/);
    });
});

/** A process repository over an array. */
function fakeProcesses(initial = []) {
    const rows = initial.map((r) => ({ ...r }));
    let next = 100;
    return {
        rows,
        async findByIntegrationAndType(integrationId, type) { return rows.filter((r) => r.integrationId === integrationId && r.type === type); },
        async create(data) { const r = { id: String(next++), ...data, updatedAt: new Date().toISOString() }; rows.push(r); return r; },
        async update(id, updates) { const r = rows.find((x) => x.id === id); Object.assign(r, updates, { updatedAt: new Date().toISOString() }); return r; },
    };
}

describe('the run: FRIGG_TRIGGER_RUN on the queue worker', () => {
    const make = ({ status = 'ENABLED', config = {}, processes = fakeProcesses() } = {}) => {
        const calls = [];
        class Running extends Poller {
            async poll(payload, ctx) { calls.push({ method: 'poll', self: this, payload, ctx }); return 'polled'; }
            async sync(payload) { calls.push({ method: 'sync', payload }); throw Object.assign(new Error('upstream 503'), { statusCode: 503 }); }
        }
        const inst = new Running({ id: 'int1', userId: 'u1', status, config: { type: 'poller', ...config } });
        inst.triggerProcessRepository = processes;
        inst.updateIntegrationMessages = { execute: jest.fn(async () => true) };
        return { inst, calls, processes, dispatch: (data) => new IntegrationEventDispatcher(inst).dispatchJob({ event: 'FRIGG_TRIGGER_RUN', data }) };
    };

    it('runs the handler as handler(payload, ctx) with the instance as this, and records the run', async () => {
        const { inst, calls, processes, dispatch } = make();
        const out = await dispatch({ integrationId: 'int1', trigger: 'poll', scheduledFor: '2026-10-19T12:00:00.000Z' });
        expect(out).toEqual({ status: 'ran', result: 'polled' });
        expect(calls[0].self).toBe(inst);
        expect(calls[0].payload).toEqual({ trigger: 'poll', scheduledFor: '2026-10-19T12:00:00.000Z' });
        expect(Object.keys(calls[0].ctx).sort()).toEqual(['config', 'integration', 'log', 'modules']);
        expect(processes.rows).toEqual([expect.objectContaining({ integrationId: 'int1', userId: 'u1', type: 'TRIGGER:poll', state: 'COMPLETED' })]);
    });

    it('discards the run for an installation that is not ENABLED, or a trigger it no longer has', async () => {
        for (const status of ['DISABLED', 'NEEDS_CONFIG', 'ERROR']) {
            const { calls, dispatch } = make({ status });
            expect(await dispatch({ trigger: 'poll', scheduledFor: 'x' })).toMatchObject({ status: 'discarded' });
            expect(calls).toEqual([]);
        }
        const gated = make({ config: { syncOn: false } });
        expect(await gated.dispatch({ trigger: 'sync', scheduledFor: 'x' })).toEqual({ status: 'discarded', reason: 'trigger is when' });
        expect(await gated.dispatch({ trigger: 'gone', scheduledFor: 'x' })).toEqual({ status: 'discarded', reason: 'trigger is not declared' });
        expect(gated.calls).toEqual([]);
    });

    it('overlap skip: a run still going (touched within 2 x tick) makes the next one skip; a stale one does not', async () => {
        const fresh = make({ processes: fakeProcesses([{ id: '1', integrationId: 'int1', type: 'TRIGGER:poll', state: 'RUNNING', updatedAt: new Date(Date.now() - 20 * 60000).toISOString() }]) });
        expect(await fresh.dispatch({ trigger: 'poll', scheduledFor: 'x' })).toMatchObject({ status: 'skipped' });
        expect(fresh.calls).toEqual([]);
        const stale = make({ processes: fakeProcesses([{ id: '1', integrationId: 'int1', type: 'TRIGGER:poll', state: 'RUNNING', updatedAt: new Date(Date.now() - 31 * 60000).toISOString() }]) });
        expect(await stale.dispatch({ trigger: 'poll', scheduledFor: 'x' })).toMatchObject({ status: 'ran' });
        expect(stale.processes.rows).toHaveLength(1);              // the record is reused, not one per run
        expect(stale.processes.rows[0].state).toBe('COMPLETED');
    });

    it('a failed run is marked ERROR and rethrown to the worker, so its retry is not skipped by itself', async () => {
        const { dispatch, processes, calls } = make();
        await expect(dispatch({ trigger: 'sync', scheduledFor: 'x' })).rejects.toMatchObject({ statusCode: 503 });
        expect(processes.rows[0]).toMatchObject({ type: 'TRIGGER:sync', state: 'ERROR', results: expect.objectContaining({ error: 'upstream 503' }) });
        await expect(dispatch({ trigger: 'sync', scheduledFor: 'x' })).rejects.toMatchObject({ statusCode: 503 });
        expect(calls.filter((c) => c.method === 'sync')).toHaveLength(2);
    });

    it('overlap allow keeps no record', async () => {
        const out = await new RunTrigger({ processRepository: { findByIntegrationAndType: () => { throw new Error('not read'); } } })
            .execute({ integration: { id: 'i', status: 'ENABLED' }, resolved: { active: true, overlap: 'allow' }, invoke: async () => 1, payload: { trigger: 't' } });
        expect(out).toEqual({ status: 'ran', result: 1 });
    });

    it('onUpdate warns about a chosen timing it cannot use, and touches no scheduler', async () => {
        const { inst } = make({ config: { triggers: { sync: { every: '5m' } } } });
        inst.persistStatus = jest.fn(async () => {});
        inst.validateConfig = async () => false;
        await inst.onUpdate({});
        expect(inst.updateIntegrationMessages.execute).toHaveBeenCalledWith('int1', 'warnings', 'Trigger timing not changed', 'sync: Runs every 5 minutes at its most frequent; the minimum is 15m', expect.any(Number));
    });

    it('a continuation tick runs on a dry instance', async () => {
        const spy = jest.spyOn(require('../use-cases/run-trigger-tick'), 'runTriggerTick').mockResolvedValue({ continued: false });
        const dry = new Poller();
        await new IntegrationEventDispatcher(dry).dispatchJob({ event: 'FRIGG_TRIGGER_TICK', data: { tick: '15m', time: 't', cursor: 3 } });
        expect(spy).toHaveBeenCalledWith(Poller, { tick: '15m', time: 't', cursor: 3 }, undefined);
        spy.mockRestore();
    });
});

describe('lifecycle needs no trigger work', () => {
    it('create, update and delete never reach the scheduler', async () => {
        const scheduler = require('../../application/commands/scheduler-commands');
        const spy = jest.spyOn(scheduler, 'createSchedulerCommands');
        const inst = new Poller({ id: 'int1', status: 'IN_CREATION', config: { type: 'poller' } });
        inst.persistStatus = jest.fn(async () => {});
        inst.updateIntegrationMessages = { execute: jest.fn() };
        await inst.onCreate();
        await inst.onUpdate({});
        await inst.onDelete();
        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
    });
});
