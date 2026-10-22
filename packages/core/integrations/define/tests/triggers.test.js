/**
 * `triggers` (ADR-055) on a defineIntegration class run on Stack B's runtime unchanged: the per-integration tick
 * (RunTriggerTick: one tick, per-installation due decisions) queues FRIGG_TRIGGER_RUN, and IntegrationBase#onTriggerRun
 * runs it with the RunTrigger use case. The author's handler gets (payload, ctx) with the ADR-054 ctx.
 */
jest.mock('../../../database/config', () => ({ DB_TYPE: 'mongodb', getDatabaseType: jest.fn(() => 'mongodb'), PRISMA_LOG_LEVEL: 'error,warn' }));

const { RunTriggerTick } = require('../../use-cases/run-trigger-tick');
const { provisioningOf } = require('../../triggers');
const { IntegrationEventDispatcher } = require('../../../handlers/integration-event-dispatcher');
const { defineIntegration, use } = require('..');
const hubspot = require('./fixtures/hubspot');
const slack = require('./fixtures/slack');

function fakeRepository(rows) {
    return { async findIntegrations({ type, status, limit, after } = {}) {
        const sorted = rows.filter((r) => r.config.type === type && r.status === status).sort((a, b) => a.id - b.id);
        const rest = after === undefined ? sorted : sorted.filter((r) => r.id > after);
        return limit ? rest.slice(0, limit) : rest;
    } };
}
function fakeQueue() {
    const q = { batches: [] };
    q.batchSend = async (entries) => { q.batches.push(entries); };
    q.send = async () => {};
    q.runs = () => q.batches.flat();
    return q;
}
function fakeProcesses() {
    const rows = [];
    return {
        rows,
        async findByIntegrationAndType(integrationId, type) { return rows.filter((r) => r.integrationId === integrationId && r.type === type); },
        async create(data) { const r = { id: String(rows.length + 1), ...data, updatedAt: new Date().toISOString() }; rows.push(r); return r; },
        async update(id, updates) { const r = rows.find((x) => x.id === id); Object.assign(r, updates); return r; },
    };
}

const digest = jest.fn(async () => ({ posted: true }));
const DealAlerts = defineIntegration({
    name: 'deal-alerts',
    modules: { crm: use(hubspot, { webhooks: { subscribe: ['deal.creation'] } }), chat: use(slack) },
    config: { digestOn: { type: 'boolean', default: true } },
    triggers: {
        digest: { cron: '0 8 * * 1-5', timezone: 'America/New_York', configurable: { min: '1h' }, when: (c) => c.digestOn !== false, handler: digest },
        sweep: { every: '15m', handler: async () => {} },
    },
});

describe('triggers on Stack B\'s tick', () => {
    it('compile into Definition.triggers, which devtools provisions (one tick per distinct cadence)', () => {
        expect(Object.keys(DealAlerts.Definition.triggers)).toEqual(['digest', 'sweep']);
        expect(provisioningOf(DealAlerts).ticks).toEqual(expect.arrayContaining([15]));
    });

    it('the tick queues a run for each ENABLED installation that is due, honouring when(config)', async () => {
        const rows = [
            { id: 1, status: 'ENABLED', config: { type: 'deal-alerts' } },
            { id: 2, status: 'ENABLED', config: { type: 'deal-alerts', digestOn: false } },
            { id: 3, status: 'DISABLED', config: { type: 'deal-alerts' } },
        ];
        const queue = fakeQueue();
        await new RunTriggerTick({ integrationClass: DealAlerts, integrationRepository: fakeRepository(rows), queue, queueUrl: 'q' })
            .execute({ tick: '5m', time: '2026-10-19T12:00:07Z' });   // 08:00 New York; a cron trigger ticks every 5m
        const digests = queue.runs().filter((m) => m.data.trigger === 'digest');
        expect(digests.map((m) => m.data.integrationId)).toEqual([1]);
        expect(digests[0]).toMatchObject({ event: 'FRIGG_TRIGGER_RUN', data: { scheduledFor: '2026-10-19T12:00:00.000Z' } });
    });

    it('the run calls the handler with (payload, ctx): ctx.modules by author key, config with defaults, no `this`', async () => {
        const crmApi = {}, chatApi = {};
        const inst = new DealAlerts({ id: 1, userId: 'u', status: 'ENABLED', config: { type: 'deal-alerts' }, modules: [{ getName: () => 'hubspot', api: crmApi }, { getName: () => 'slack', api: chatApi }] });
        inst.triggerProcessRepository = fakeProcesses();
        await inst.initialize();
        const outcome = await new IntegrationEventDispatcher(inst).dispatchJob({ event: 'FRIGG_TRIGGER_RUN', data: { integrationId: 1, trigger: 'digest', scheduledFor: '2026-10-19T12:00:00.000Z' } });
        expect(outcome.status).toBe('ran');
        const [payload, ctx] = digest.mock.calls[0];
        expect(payload).toEqual({ trigger: 'digest', scheduledFor: '2026-10-19T12:00:00.000Z' });
        expect(ctx.modules.crm).toBe(crmApi);
        expect(ctx.modules.chat).toBe(chatApi);
        expect(ctx.config).toMatchObject({ digestOn: true });
        expect(ctx.integration.id).toBe(1);
        expect(digest.mock.contexts[0]).toBeUndefined();
    });

    it('rejects invalid triggers and dotted names (reserved for module extensions) when the class is defined', () => {
        const spec = (triggers) => ({ name: 'x', modules: { crm: hubspot }, triggers });
        expect(() => defineIntegration(spec({ t: { every: '2d', handler: () => {} } }))).toThrow(/longer than 1d/);
        expect(() => defineIntegration(spec({ t: { every: '15m', handler: 'method' } }))).toThrow(/"handler" must be a function/);
        expect(() => defineIntegration(spec({ 'crm.t': { every: '15m', handler: () => {} } }))).toThrow(/dotted names are reserved/);
    });

    it('extension triggers merge as <moduleKey>.<name> and get the extension ctx (api, options)', async () => {
        const tick = jest.fn();
        const mod = { Definition: { moduleName: 'erp' }, extensions: { poll: { name: 'erp-poll', contract: 2, options: { type: 'object', properties: { every: { type: 'string' } } }, triggers: { check: { every: '15m', handler: tick } } } } };
        const Cls = defineIntegration({ name: 'erp-sync', modules: { erp: use(mod, { poll: { every: '15m' } }) } });
        expect(Object.keys(Cls.Definition.triggers)).toEqual(['erp.check']);
        const api = {};
        const inst = new Cls({ id: 5, status: 'ENABLED', config: { type: 'erp-sync' }, modules: [{ getName: () => 'erp', api }] });
        inst.triggerProcessRepository = fakeProcesses();
        await inst.onTriggerRun({ data: { integrationId: 5, trigger: 'erp.check', scheduledFor: 't' } });
        expect(tick.mock.calls[0][1]).toMatchObject({ api, options: { every: '15m' }, integration: expect.objectContaining({ id: 5 }) });
    });
});
