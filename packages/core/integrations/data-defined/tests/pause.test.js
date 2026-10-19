/**
 * Paused runs: a delay or an approval ends the run for now with status waiting, saves a checkpoint, books its resume
 * (mock scheduler), and the run carries on from the next step when the delay ends, someone decides, or the approval
 * times out. One run row from first step to last. The queue is drained in-process, as the queue worker would.
 */
const express = require('express');
const request = require('supertest');
const d = require('..');
const { setDataDefinedRoutes } = require('../router');
const { hubspotApi, phoneApi } = require('./helpers-fake-crm');
const { MockSchedulerAdapter } = require('../../../infrastructure/scheduler/mock-scheduler-adapter');
const { createSchedulerCommands } = require('../../../application/commands/scheduler-commands');

const manifests = d.loadManifests();
const example = (id) => JSON.parse(JSON.stringify(d.loadExamples().find((x) => x.id === id)));

class FakeBase {
    constructor(p = {}) { this.events = {}; this.config = p.config; this.id = p.id; this.rows = new Map(); this.queue = []; }
    async initialize() { this.registerEventHandlers(); }
    registerEventHandlers() {}
    async patchConfig(c) { this.config = { ...this.config, ...c }; }
    async getMapping(k) { return this.rows.has(k) ? { mapping: this.rows.get(k) } : null; }
    async upsertMapping(k, v) { this.rows.set(k, JSON.parse(JSON.stringify(v))); }
    async createMapping(k, v) { if (this.rows.has(k)) { const e = new Error('exists'); e.name = 'MappingAlreadyExistsError'; throw e; } this.rows.set(k, v); }
    async deleteMapping(k) { this.rows.delete(k); }
    async queueWebhook(m) { this.queue.push(m); }
}

/** A run store with the repository's contract: rows by id, addressed by runKey. */
function runStore() {
    const rows = new Map();
    let n = 0;
    return {
        rows,
        async createRun(r) { const row = { ...JSON.parse(JSON.stringify(r)), id: String(++n) }; rows.set(row.id, row); return row; },
        async updateRun(id, data) { const row = rows.get(String(id)); Object.assign(row, JSON.parse(JSON.stringify(data))); return row; },
        async findRun(integrationId, runKey) { return [...rows.values()].find((r) => r.runKey === runKey) || null; },
        async listRuns() { return [...rows.values()]; },
    };
}

const workflow = (id, steps) => ({ id, label: id, default: 'on', trigger: { type: 'userAction', label: id }, steps });
function definition(...workflows) {
    const def = example('phone-hubspot');
    def.workflows.push(...workflows);
    return def;
}

function setup(defs) {
    const runs = runStore();
    const scheduler = new MockSchedulerAdapter();
    const Cls = d.defineSharedIntegrationClass({ definitions: d.memoryDefinitions(defs), manifests, modules: { phone: {}, hubspot: {} }, IntegrationBase: FakeBase, runs });
    const inst = new Cls({ id: 'int1', config: { type: 'data-defined', definition: { id: defs[0].id, version: defs[0].version }, settings: { fromNumber: '+15125550100' } } });
    inst.hubspot = { api: hubspotApi() };
    inst.phone = { api: phoneApi() };
    inst.schedulerCommands = createSchedulerCommands({ integrationName: 'data-defined', schedulerService: scheduler });
    process.env.DATA_DEFINED_QUEUE_URL = 'https://sqs.us-east-1.amazonaws.com/123456789012/data-defined-queue';
    /** What the scheduler's one booked job would deliver: the queue worker hands `data` to the event's handler. */
    const fire = async () => {
        const [name] = Object.keys(scheduler._getSchedules());
        const message = scheduler._simulateTrigger(name);
        await scheduler.deleteSchedule(name);
        return inst.events[message.event].handler({ data: message.data });
    };
    const drain = async () => { const out = []; while (inst.queue.length) { const { event, ...data } = inst.queue.shift(); out.push(await inst.events[event].handler({ data })); } return out; };
    return { inst, runs, scheduler, fire, drain, Cls };
}

beforeEach(() => { jest.spyOn(console, 'log').mockImplementation(() => {}); jest.spyOn(console, 'warn').mockImplementation(() => {}); });
afterEach(() => jest.restoreAllMocks());

describe('delay', () => {
    const def = () => definition(workflow('follow-up', [
        { id: 'wait', use: 'delay', with: { for: '2h' } },
        { id: 'task', use: 'hubspot.contact.create', with: { properties: { firstname: 'Later', note: '{{steps.wait.until}}' } } },
    ]));

    it('pauses, books its resume at the delay\'s end, then runs the next step; one run row throughout', async () => {
        const { inst, runs, scheduler, fire } = setup([def()]);
        await inst.initialize();
        const paused = await inst.events.WF_FOLLOW_UP.handler({});
        expect(paused).toMatchObject({ status: 'waiting', waitingFor: { stepId: 'wait', kind: 'delay', until: expect.any(String) } });
        expect(paused.checkpoint).toBeUndefined();                          // the step results stay out of the response
        expect(inst.hubspot.api.writes).toEqual([]);
        const [job] = Object.values(scheduler._getSchedules());
        expect(Date.parse(job.scheduledAt) - Date.now()).toBeGreaterThan(119 * 60000);
        expect(job.payload.data).toMatchObject({ integrationId: 'int1', resume: paused.id, reason: 'delay', index: 0 });
        const [row] = runs.rows.values();
        expect(row).toMatchObject({ status: 'waiting', runKey: paused.id, waitingFor: { kind: 'delay' } });
        expect(JSON.stringify(row)).not.toContain('Later');                 // no step data on the run row
        expect(inst.rows.get(`wait:${paused.id}`)).toMatchObject({ workflowId: 'follow-up', index: 0, rowId: row.id });

        const done = await fire();
        expect(done.status).toBe('completed');
        expect(inst.hubspot.api.writes).toEqual([['create', { firstname: 'Later', note: paused.waitingFor.until }]]);
        expect(runs.rows.size).toBe(1);
        expect(row).toMatchObject({ status: 'completed', waitingFor: null, endedAt: expect.any(String) });
        expect(row.trace.map((t) => `${t.id}:${t.status}`)).toEqual(['wait:ok', 'task:ok']);
        expect(inst.rows.has(`wait:${paused.id}`)).toBe(false);
    });

    it('a resume delivered twice runs the rest once; a resume for a run that finished is a no-op', async () => {
        const { inst, scheduler } = setup([def()]);
        await inst.initialize();
        const paused = await inst.events.WF_FOLLOW_UP.handler({});
        const message = scheduler._simulateTrigger(Object.keys(scheduler._getSchedules())[0]);
        const [a, b] = await Promise.all([inst.events.WF_FOLLOW_UP.handler({ data: message.data }), inst.events.WF_FOLLOW_UP.handler({ data: message.data })]);
        expect([a.status, b.status].sort()).toEqual(['completed', 'duplicate']);
        expect(await inst.events.WF_FOLLOW_UP.handler({ data: message.data })).toEqual({ status: 'gone', runId: paused.id });
        expect(inst.hubspot.api.writes).toHaveLength(1);
    });

    it('a delay until a time already past does not pause', async () => {
        const { inst } = setup([definition(workflow('now', [{ id: 'wait', use: 'delay', with: { until: '2020-01-01T00:00:00Z' } }, { id: 'x', use: 'hubspot.contact.create', with: { properties: { firstname: 'Now' } } }]))]);
        await inst.initialize();
        expect((await inst.events.WF_NOW.handler({})).status).toBe('completed');
    });

    it('a step that fails after the resume is retried: the claim is given back so the retry resumes again', async () => {
        const { inst, scheduler } = setup([def()]);
        await inst.initialize();
        await inst.events.WF_FOLLOW_UP.handler({});
        const message = scheduler._simulateTrigger(Object.keys(scheduler._getSchedules())[0]);
        const create = inst.hubspot.api.createContact;
        inst.hubspot.api.createContact = async () => { throw new Error('503'); };
        await expect(inst.events.WF_FOLLOW_UP.handler({ data: message.data })).rejects.toThrow('503');
        inst.hubspot.api.createContact = create;
        expect((await inst.events.WF_FOLLOW_UP.handler({ data: message.data })).status).toBe('completed');
    });

    it('if the checkpoint cannot be saved, the event\'s claim is given back and the error thrown (the queue runs it again)', async () => {
        const wf = workflow('hooked', [{ id: 'wait', use: 'delay', with: { for: '1h' } }]);
        const { inst } = setup([definition(wf)]);
        await inst.initialize();
        const put = inst.upsertMapping.bind(inst);
        inst.upsertMapping = async (k, v) => { if (k.startsWith('wait:')) throw new Error('db down'); return put(k, v); };
        await expect(inst.dispatch({ kind: 'workflow', id: 'hooked' }, { data: { eventId: 'E1' } })).rejects.toThrow('db down');
        expect(inst.rows.has('evt:phone-hubspot:hooked:E1')).toBe(false);
        inst.upsertMapping = put;
        expect((await inst.dispatch({ kind: 'workflow', id: 'hooked' }, { data: { eventId: 'E1' } })).status).toBe('waiting');
    });
});

describe('guards', () => {
    it('the interpreter refuses a pause where it cannot checkpoint, even in a definition that skipped validation', async () => {
        const { execute } = require('../interpreter');
        const ports = { call: async () => ({}) };
        await expect(execute([{ id: 'each', use: 'foreach', with: { over: [1] }, do: [{ id: 'w', use: 'delay', with: { for: '1h' } }] }], { ctx: {}, ports, canWait: true }))
            .rejects.toThrow('delay can only be a top-level workflow step');
        await expect(execute([{ id: 'w', use: 'delay', with: { for: '1h' } }], { ctx: {}, ports }))       // a query or lifecycle hook
            .rejects.toThrow('delay can only be a top-level workflow step');
        expect((await execute([{ id: 'w', use: 'delay', with: { for: '1h' } }], { ctx: {}, ports, canWait: true })).status).toBe('waiting');
    });

    it('a delay is resumed only by its own end, and only for the pause the run is at now', async () => {
        const { inst, scheduler, fire } = setup([definition(workflow('steps', [
            { id: 'one', use: 'delay', with: { for: '1h' } },
            { id: 'two', use: 'delay', with: { for: '1h' } },
            { id: 'create', use: 'hubspot.contact.create', with: { properties: { firstname: 'End' } } },
        ]))]);
        await inst.initialize();
        const paused = await inst.events.WF_STEPS.handler({});
        expect(await inst.events.WF_STEPS.handler({ data: { resume: paused.id, reason: 'decision', decision: 'approved', index: 0 } })).toMatchObject({ status: 'ignored' });
        const first = scheduler._simulateTrigger(Object.keys(scheduler._getSchedules())[0]);
        await fire();                                                     // now waiting at "two"
        expect(await inst.events.WF_STEPS.handler({ data: first.data })).toMatchObject({ status: 'ignored', reason: 'a resume for an earlier pause' });
        expect(inst.hubspot.api.writes).toEqual([]);
        expect((await fire()).status).toBe('completed');
    });
});

describe('approval', () => {
    const approvalDef = (withArgs = {}) => definition(workflow('gate', [
        { id: 'ok', use: 'approval', with: { prompt: 'Create the contact?', timeout: '1d', ...withArgs } },
        { id: 'rejected', use: 'stop', when: "$.steps.ok.decision == 'rejected'", with: { reason: 'rejected' } },
        { id: 'create', use: 'hubspot.contact.create', with: { properties: { firstname: 'Approved', approvedBy: '$.steps.ok.by' } } },
    ]));

    function app(inst, userId = 'u1') {
        const a = express();
        a.use(express.json());
        const authenticateUser = { execute: async () => ({ getId: () => userId }) };
        // As the real use case: the record names its owner, and execute() refuses anyone else.
        const getIntegrationInstance = {
            integrationRepository: { findIntegrationById: async (id) => (id === 'int1' ? { id, userId: 'u1' } : null) },
            execute: async (id, uid) => { if (uid !== 'u1') { const e = new Error(`Integration ${id} does not belong to User ${uid}`); e.status = 500; throw e; } return inst; },
        };
        setDataDefinedRoutes(a, authenticateUser, { getIntegrationInstance, integrationClasses: [inst.constructor] });
        a.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message })); // eslint-disable-line no-unused-vars
        return a;
    }

    it('waits for a decision; approve carries on with who decided; a second decision is refused; the timeout then does nothing', async () => {
        const { inst, drain, fire, runs } = setup([approvalDef()]);
        await inst.initialize();
        const paused = await inst.events.WF_GATE.handler({});
        expect(paused.waitingFor).toEqual({ stepId: 'ok', kind: 'approval', until: expect.any(String), prompt: 'Create the contact?', approvers: null, onTimeout: 'reject' });
        const listed = await request(app(inst)).get('/api/integrations/int1/runs?status=waiting');
        expect(listed.body.runs.map((r) => r.waitingFor.prompt)).toEqual(['Create the contact?']);

        const r = await request(app(inst)).post(`/api/integrations/int1/runs/${paused.id}/decision`).send({ decision: 'approve', note: 'fine' });
        expect(r.status).toBe(202);
        expect((await request(app(inst)).post(`/api/integrations/int1/runs/${paused.id}/decision`).send({ decision: 'reject' })).status).toBe(202);   // queued before the first ran
        const [first, second] = await drain();
        expect(first.status).toBe('completed');
        expect(second.status).toBe('gone');
        expect(inst.hubspot.api.writes).toEqual([['create', { firstname: 'Approved', approvedBy: 'u1' }]]);
        expect((await request(app(inst)).post(`/api/integrations/int1/runs/${paused.id}/decision`).send({ decision: 'reject' })).status).toBe(404);
        expect((await fire()).status).toBe('gone');
        expect([...runs.rows.values()][0]).toMatchObject({ status: 'completed' });
    });

    it('a decision while the first is being carried out is refused (409), not queued again', async () => {
        const { inst } = setup([approvalDef()]);
        await inst.initialize();
        const paused = await inst.events.WF_GATE.handler({});
        await inst.createMapping(`resume:${paused.id}:0`, { at: 'now' });
        const r = await request(app(inst)).post(`/api/integrations/int1/runs/${paused.id}/decision`).send({ decision: 'approve' });
        expect(r.status).toBe(409);
        expect(inst.queue).toEqual([]);
    });

    it('reject: the run carries on with decision rejected (the definition decides what that means)', async () => {
        const { inst, drain } = setup([approvalDef()]);
        await inst.initialize();
        const paused = await inst.events.WF_GATE.handler({});
        await request(app(inst)).post(`/api/integrations/int1/runs/${paused.id}/decision`).send({ decision: 'reject' });
        const [out] = await drain();
        expect(out).toMatchObject({ status: 'stopped', reason: 'rejected' });
        expect(inst.hubspot.api.writes).toEqual([]);
    });

    it('timeout: reject by default, approve when told, or end the run with onTimeout: stop', async () => {
        for (const [onTimeout, status, writes] of [[undefined, 'stopped', 0], ['approve', 'completed', 1], ['stop', 'stopped', 0]]) {
            const { inst, fire } = setup([approvalDef(onTimeout ? { onTimeout } : {})]);
            await inst.initialize();
            await inst.events.WF_GATE.handler({});
            const out = await fire();
            expect(out.status).toBe(status);
            expect(inst.hubspot.api.writes).toHaveLength(writes);
            if (onTimeout === 'stop') expect(out.reason).toBe('approval timed out');
            if (onTimeout === 'approve') expect(inst.hubspot.api.writes[0][1].approvedBy).toBe('timeout');
        }
    });

    it('a named approver decides without owning the installation; anyone else learns nothing; a bad decision or a delay cannot be decided', async () => {
        const def = approvalDef({ approvers: ['boss'] });
        def.workflows.push(workflow('wait', [{ id: 'w', use: 'delay', with: { for: '1h' } }]));
        const { inst } = setup([def]);
        await inst.initialize();
        const delayed = await inst.events.WF_WAIT.handler({});
        expect((await request(app(inst, 'u1')).post(`/api/integrations/int1/runs/${delayed.id}/decision`).send({ decision: 'approve' })).status).toBe(409);
        expect((await request(app(inst, 'boss')).post(`/api/integrations/int1/runs/${delayed.id}/decision`).send({ decision: 'approve' })).status).toBe(404);   // not named on the delay
        const paused = await inst.events.WF_GATE.handler({});
        expect((await request(app(inst, 'u1')).post(`/api/integrations/int1/runs/${paused.id}/decision`).send({ decision: 'approve' })).status).toBe(403);   // the owner, but not named
        const stranger = await request(app(inst, 'mallory')).post(`/api/integrations/int1/runs/${paused.id}/decision`).send({ decision: 'approve' });
        expect(stranger.status).toBe(404);
        expect(stranger.body.code).toBe('NOT_FOUND');
        expect((await request(app(inst, 'mallory')).post(`/api/integrations/nope/runs/${paused.id}/decision`).send({ decision: 'approve' })).status).toBe(404);
        expect((await request(app(inst, 'boss')).post(`/api/integrations/int1/runs/${paused.id}/decision`).send({ decision: 'maybe' })).status).toBe(400);
        expect((await request(app(inst, 'boss')).post(`/api/integrations/int1/runs/${paused.id}/decision`).send({ decision: 'approve' })).status).toBe(202);
        expect(inst.queue).toEqual([expect.objectContaining({ resume: paused.id, decision: 'approved', by: 'boss' })]);
        expect(inst.queue).toHaveLength(1);
    });
});

describe('across pauses and versions', () => {
    it('a run can pause more than once: delay, then approval, still one row', async () => {
        const { inst, fire, drain, runs } = setup([definition(workflow('two', [
            { id: 'cool', use: 'delay', with: { for: '30m' } },
            { id: 'ok', use: 'approval', with: { prompt: 'Go?' } },
            { id: 'create', use: 'hubspot.contact.create', with: { properties: { firstname: 'Both' } } },
        ]))]);
        await inst.initialize();
        const first = await inst.events.WF_TWO.handler({});
        const second = await fire();
        expect(second).toMatchObject({ status: 'waiting', id: first.id, waitingFor: { stepId: 'ok', kind: 'approval' } });
        await inst.decide(first.id, { decision: 'approve', userId: 'u1' });
        const [done] = await drain();
        expect(done.status).toBe('completed');
        expect(runs.rows.size).toBe(1);
        expect([...runs.rows.values()][0].trace.map((t) => `${t.id}:${t.status}`)).toEqual(['cool:ok', 'ok:ok', 'create:ok']);
    });

    it('a run paused on version 1 finishes on version 1 after the installation upgrades', async () => {
        const v1 = definition(workflow('flow', [{ id: 'wait', use: 'delay', with: { for: '1h' } }, { id: 'create', use: 'hubspot.contact.create', with: { properties: { firstname: 'V1' } } }]));
        const v2 = JSON.parse(JSON.stringify(v1));
        v2.version = '1.5.0';
        v2.workflows.find((w) => w.id === 'flow').steps[1].with.properties.firstname = 'V2';
        const { inst, fire } = setup([v1, v2]);
        await inst.initialize();
        await inst.events.WF_FLOW.handler({});
        expect((await inst.upgradeTo('1.5.0', { apply: true })).applied).toBe(true);
        await fire();
        expect(inst.hubspot.api.writes).toEqual([['create', { firstname: 'V1' }]]);
    });

    it('validation: pausing steps only at a workflow\'s top level, with an id, and literal arguments that make sense', () => {
        const def = definition(
            workflow('nested', [{ id: 'each', use: 'foreach', with: { over: '$.event.items' }, do: [{ id: 'w', use: 'delay', with: { for: '1h' } }] }]),
            workflow('noid', [{ use: 'approval', with: { prompt: 'x' } }]),
            workflow('bad', [{ id: 'a', use: 'delay', with: { for: '1w' } }, { id: 'b', use: 'approval', with: { prompt: 'x', onTimeout: 'ignore' } }, { id: 'c', use: 'delay', with: {} }]),
        );
        def.queries.push({ id: 'q-wait', steps: [{ id: 'w', use: 'delay', with: { for: '1h' } }], returns: {} });
        const msgs = d.validate(def, manifests).errors.map((e) => `${e.path}: ${e.message}`);
        expect(msgs).toEqual(expect.arrayContaining([
            expect.stringMatching(/do\[0\]: delay can only be a top-level step of a workflow/),
            expect.stringMatching(/approval needs an id/),
            expect.stringMatching(/with.for: "1w" is not a duration/),
            expect.stringMatching(/with.onTimeout: reject, approve or stop/),
            expect.stringMatching(/delay takes for .* or until .*, exactly one/),
            expect.stringMatching(/queries.*delay can only be a top-level step of a workflow/),
        ]));
    });
});
