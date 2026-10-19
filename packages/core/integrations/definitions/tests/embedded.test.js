/**
 * A code integration embedding a definition (extendIntegrationClass): it keeps its own name, modules, handlers,
 * webhooks, form and schedules, and gains workflows with approvals, code steps calling its own methods, and run
 * history for its own queued events, all through the same records and routes as a published integration.
 */
const express = require('express');
const request = require('supertest');
const d = require('..');
const { setIntegrationRuntimeRoutes } = require('../router');
const { IntegrationEventDispatcher } = require('../../../handlers/integration-event-dispatcher');
const { hubspotApi, quoApi } = require('./helpers-fake-crm');

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
    async onCreate() { this.created = true; }
    async onWebhook() { return { handledBy: 'base' }; }
    async getConfigOptions() { return { jsonSchema: { base: true } }; }
    scheduleEntries() { return []; }
}

/** The hand-written integration: its own queued event, webhook handling, form and schedule. */
class QuoReports extends FakeBase {
    static Definition = { name: 'quo-reports', version: '2.0.0', modules: { quo: { definition: {} }, hubspot: { definition: {} } }, display: { label: 'Quo reports' }, schedules: { NIGHTLY: { every: '1d' } } };
    constructor(p) {
        super(p);
        this.events = { NIGHTLY: { type: 'QUEUE', handler: async ({ data }) => this.nightly(data) }, BROKEN: { type: 'QUEUE', handler: async () => { throw new Error('boom'); } } };
    }
    async nightly(data) { return { sent: true, ...data }; }
    async onWebhook() { return { handledBy: 'code' }; }
    async getConfigOptions() { return { jsonSchema: { code: true } }; }
    scheduleEntries() { return [{ key: 'NIGHTLY', event: 'NIGHTLY', default: { every: '1d' } }]; }
    /** Called by the embedded workflow as `#notifyTeam`. */
    async notifyTeam({ who }) { this.notified = (this.notified || []).concat(who); return { ok: true, who }; }
}

/** An embedded definition: one button workflow that waits for an approval, then calls a method of the class. */
function embeddedDefinition(over = {}) {
    const def = example('quo-hubspot');
    def.id = 'quo-reports';
    def.version = '1.0.0';
    def.syncs = []; def.ui = []; def.queries = []; def.lifecycle = {}; def.settings = {};
    def.workflows = [{ id: 'escalate', label: 'Escalate', default: 'on', trigger: { type: 'userAction', label: 'Escalate' }, steps: [
        { id: 'ok', use: 'approval', with: { prompt: 'Escalate?', approvers: ['boss'] } },
        { id: 'tell', use: 'code', with: { ref: '#notifyTeam', with: { who: '$.steps.ok.by' } } },
    ] }];
    return { ...def, ...over };
}

function runStore() {
    const rows = new Map();
    let n = 0;
    return {
        rows,
        async createRun(r) { const row = { ...JSON.parse(JSON.stringify(r)), id: String(++n) }; rows.set(row.id, row); return row; },
        async updateRun(id, data) { const row = rows.get(String(id)); Object.assign(row, JSON.parse(JSON.stringify(data))); return row; },
        async findRun() { return null; },
        async listRuns() { return [...rows.values()]; },
    };
}

function setup(def = embeddedDefinition()) {
    const runs = runStore();
    const Cls = d.extendIntegrationClass(QuoReports, { definition: def, manifests, runs });
    const inst = new Cls({ id: 'int1', config: { type: 'quo-reports', settings: { fromNumber: '+15125550100' } } });
    inst.hubspot = { api: hubspotApi() };
    inst.quo = { api: quoApi() };
    return { Cls, inst, runs };
}

describe('a code integration embedding a definition', () => {
    it('keeps its identity: name, modules, schedules, display, and its own events beside the compiled ones', async () => {
        const { Cls, inst } = setup();
        expect(Cls.Definition).toMatchObject({ name: 'quo-reports', version: '2.0.0', schedules: { NIGHTLY: { every: '1d' } }, display: { label: 'Quo reports' } });
        expect(Cls.Definition.modules).toBe(QuoReports.Definition.modules);
        expect(Cls.getDeploymentName?.() ?? Cls.Definition.name).toBe('quo-reports');
        await inst.initialize();
        expect(Object.keys(inst.events).sort()).toEqual(['BROKEN', 'NIGHTLY', 'WF_ESCALATE']);
        expect(inst.scheduleEntries().map((e) => e.key)).toEqual(['NIGHTLY']);
        expect(inst instanceof QuoReports).toBe(true);
    });

    it('a workflow pauses for its approver, then calls the class\'s own method with who decided', async () => {
        const { inst, runs } = setup();
        await inst.initialize();
        const paused = await inst.events.WF_ESCALATE.handler({});
        expect(paused.status).toBe('waiting');
        await inst.decide(paused.id, { decision: 'approve', userId: 'boss', isOwner: false });
        const { event, ...data } = inst.queue.shift();
        const done = await inst.events[event].handler({ data });
        expect(done.status).toBe('completed');
        expect(inst.notified).toEqual(['boss']);
        expect([...runs.rows.values()].map((r) => [r.workflowId, r.status])).toEqual([['escalate', 'completed']]);
    });

    it('its own queued events are runs in the same history; a failure is recorded and still thrown', async () => {
        const { inst, runs } = setup();
        await inst.initialize();
        const out = await new IntegrationEventDispatcher(inst).dispatchJob({ event: 'NIGHTLY', data: { day: 'mon' } });
        expect(out).toEqual({ sent: true, day: 'mon' });
        await expect(new IntegrationEventDispatcher(inst).dispatchJob({ event: 'BROKEN', data: {} })).rejects.toThrow('boom');
        expect([...runs.rows.values()].map((r) => [r.workflowId, r.triggerType, r.status, r.error])).toEqual([['NIGHTLY', 'code', 'completed', null], ['BROKEN', 'code', 'failed', 'boom']]);
        // A compiled workflow dispatched by the queue is one run (its own, with steps), not a second "code" run.
        runs.rows.clear();
        await new IntegrationEventDispatcher(inst).dispatchJob({ event: 'WF_ESCALATE', data: {} });
        expect([...runs.rows.values()].map((r) => [r.workflowId, r.status])).toEqual([['escalate', 'waiting']]);
        // A run store that fails never changes the handler's outcome.
        inst.constructor.IntegrationRuntime.runs().createRun = async () => { throw new Error('db down'); };
        expect(await new IntegrationEventDispatcher(inst).dispatchJob({ event: 'NIGHTLY', data: {} })).toEqual({ sent: true });
    });

    it('what the definition does not declare stays the code\'s: webhooks and the configure form', async () => {
        const { inst } = setup();
        await inst.initialize();
        expect(await inst.onWebhook({ data: { body: {} } })).toEqual({ handledBy: 'code' });
        expect(await inst.getConfigOptions()).toEqual({ jsonSchema: { code: true } });
        // Once the definition declares settings, the form is generated from it.
        const withSettings = setup(embeddedDefinition({ settings: { team: { type: 'string', label: 'Team', required: true } } })).inst;
        await withSettings.initialize();
        const form = await withSettings.getConfigOptions();
        expect(JSON.stringify(form)).toContain('Team');
    });

    it('runs the version deployed with the code, whatever an installation pinned before', async () => {
        const { Cls } = setup(embeddedDefinition({ version: '1.1.0' }));
        const inst = new Cls({ id: 'int1', config: { type: 'quo-reports', definition: { id: 'quo-reports', version: '1.0.0' } } });
        await inst.initialize();
        expect(inst.def.version).toBe('1.1.0');
        expect(inst.config.definition.version).toBe('1.1.0');
    });

    it('refuses a definition with another id, an invalid one, or a #method the class does not have; a published definition cannot call #methods', () => {
        expect(() => d.extendIntegrationClass(QuoReports, { definition: { ...embeddedDefinition(), id: 'other' }, manifests })).toThrow('must have the id "quo-reports"');
        const bad = embeddedDefinition();
        bad.workflows[0].steps[1].with.ref = '#noSuchMethod';
        expect(() => d.extendIntegrationClass(QuoReports, { definition: bad, manifests })).toThrow('no method "noSuchMethod"');
        expect(d.validate(embeddedDefinition(), manifests).errors.map((e) => e.message).join()).toContain('only a definition embedded in one can');
    });

    it('answers the shared routes: runs, syncs and upgrade', async () => {
        const { inst } = setup();
        await inst.initialize();
        await new IntegrationEventDispatcher(inst).dispatchJob({ event: 'NIGHTLY', data: {} });
        const app = express();
        app.use(express.json());
        setIntegrationRuntimeRoutes(app, { execute: async () => ({ getId: () => 'u1' }) }, { getIntegrationInstance: { execute: async () => inst, integrationRepository: { findIntegrationById: async () => ({ userId: 'u1' }) } }, integrationClasses: [inst.constructor] });
        expect((await request(app).get('/api/integrations/int1/runs')).body.runs.map((r) => r.workflowId)).toEqual(['NIGHTLY']);
        expect((await request(app).get('/api/integrations/int1/syncs')).body).toEqual({ syncs: [] });
        expect((await request(app).get('/api/integrations/int1/upgrade')).body).toMatchObject({ allowed: false });
    });
});
