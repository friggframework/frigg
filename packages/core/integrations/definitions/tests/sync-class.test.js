/**
 * The sync engine wired into the installation: the backfill button, one queued page per message, webhook events,
 * polling ticks, syncRecord workflows, the progress route, a backfill at install and a relink after an upgrade.
 * The queue is drained in-process by calling the compiled handlers, as the queue worker does.
 */
const express = require('express');
const request = require('supertest');
const d = require('..');
const { setIntegrationRuntimeRoutes } = require('../router');
const { hubspotApi, quoApi } = require('./helpers-fake-crm');

const manifests = d.loadManifests();
const example = (id) => JSON.parse(JSON.stringify(d.loadExamples().find((x) => x.id === id)));

class FakeBase {
    constructor(p = {}) { this.events = {}; this.config = p.config; this.id = p.id; this.rows = new Map(); this.queue = []; this.runs = []; }
    async initialize() { this.registerEventHandlers(); }
    registerEventHandlers() {}
    async patchConfig(c) { this.config = { ...this.config, ...c }; }
    async onCreate() {}
    async getMapping(k) { return this.rows.has(k) ? { mapping: this.rows.get(k) } : null; }
    async upsertMapping(k, v) { this.rows.set(k, JSON.parse(JSON.stringify(v))); }
    async createMapping(k, v) { if (this.rows.has(k)) { const e = new Error('exists'); e.name = 'MappingAlreadyExistsError'; throw e; } this.rows.set(k, v); }
    async deleteMapping(k) { this.rows.delete(k); }
    async queueWebhook(m) { this.queue.push(m); }
}

/** quo-hubspot plus a workflow that runs once for every contact the sync creates. */
function defWithSyncWorkflow() {
    const def = example('quo-hubspot');
    def.workflows.push({ id: 'welcome', label: 'Welcome new contacts', default: 'on', trigger: { type: 'syncRecord', sync: 'contacts', on: ['created'] }, steps: [{ id: 'note', use: 'set', with: { who: '$.event.ids.quo' } }] });
    return def;
}

function setup(defs = [defWithSyncWorkflow()]) {
    const definitions = d.memoryDefinitions(defs);
    const Cls = d.defineSharedIntegrationClass({ definitions, manifests, modules: { quo: {}, hubspot: {} }, IntegrationBase: FakeBase, runs: { async createRun(r) { return r; } } });
    const hubspot = hubspotApi(), quo = quoApi();
    hubspot.verifyWebhookSignature = async () => true;
    quo.verifyWebhookSignature = async () => true;
    quo.createUnifiedWebhook = async () => ({ id: 'WH1' });
    quo.deleteWebhook = async () => ({});
    const inst = new Cls({ id: 'int1', config: { type: 'integration-runtime', definition: { id: defs[0].id, version: defs[0].version }, settings: { fromNumber: '+15125550100' } } });
    inst.hubspot = { api: hubspot, entity: { externalId: '1944396' } };
    inst.quo = { api: quo };
    const recorded = [];
    inst.recordRun = async (r) => { recorded.push(r); return r; };
    /** Run every queued message, as the queue worker would, until the queue is empty. */
    inst.drain = async () => {
        let n = 0;
        while (inst.queue.length) {
            const { event, ...data } = inst.queue.shift();
            await inst.events[event].handler({ data });
            n += 1;
        }
        return n;
    };
    return { inst, hubspot, quo, recorded, Cls };
}

describe('sync, wired into the installation', () => {
    it('the backfill button queues pages until done; created contacts fire the workflow once each; progress is readable', async () => {
        const { inst, hubspot, quo, recorded } = setup();
        await inst.initialize();
        for (let i = 0; i < 3; i += 1) hubspot.seed({ firstname: `H${i}`, email: `h${i}@x.com` });
        const out = await inst.events.SYNC_CONTACTS_BACKFILL.handler({});
        expect(out).toMatchObject({ started: true, progress: { status: 'running' } });
        expect(inst.queue).toEqual([expect.objectContaining({ event: 'SYNC_CONTACTS_PAGE', role: 'source', cursor: null, runId: out.progress.runId })]);

        await inst.drain();
        expect(quo.records.size).toBe(3);
        const [status] = await inst.syncStatus();
        expect(status).toMatchObject({ id: 'contacts', direction: 'two_way', ongoing: 'webhook', backfill: { status: 'completed', pages: 2, counts: { created: 3, unchanged: 3 } } });
        expect(recorded.filter((r) => r.workflowId === 'welcome').map((r) => r.status)).toEqual(['completed', 'completed', 'completed']);

        // Pressing the button again while one runs is refused, not doubled.
        const again = await inst.events.SYNC_CONTACTS_BACKFILL.handler({});
        expect(again.started).toBe(true);                       // the last one finished, so a new one may start
        expect((await inst.events.SYNC_CONTACTS_BACKFILL.handler({})).started).toBe(false);
    });

    it('a HubSpot webhook (an app-level batch of ids) reaches the sync and creates the contact in Quo', async () => {
        const { inst, hubspot, quo, recorded } = setup();
        await inst.initialize();
        const id = hubspot.seed({ firstname: 'Wren', email: 'wren@x.com' });
        await inst.onWebhook({ data: { body: [{ portalId: 1944396, objectId: id, subscriptionType: 'contact.creation', eventId: 77 }], headers: {}, query: { module: 'hubspot' } } });
        expect(inst.queue.map((m) => m.event)).toEqual(['SYNC_CONTACTS_ONGOING']);
        await inst.drain();
        expect(quo.writes).toEqual([['create', { firstName: 'Wren', emails: [{ value: 'wren@x.com' }] }, id]]);
        // A later change is an update: the welcome workflow listens for created only, so it does not run again.
        hubspot.records.get(id).properties.firstname = 'Wrenna';
        await inst.onWebhook({ data: { body: [{ portalId: 1944396, objectId: id, subscriptionType: 'contact.propertyChange', eventId: 78 }], headers: {}, query: { module: 'hubspot' } } });
        await inst.drain();
        expect(quo.writes.map((w) => w[0])).toEqual(['create', 'update']);
        expect(recorded.filter((r) => r.workflowId === 'welcome')).toHaveLength(1);
    });

    it('a poll tick runs the poll; a page for an old run is dropped', async () => {
        const def = defWithSyncWorkflow();
        def.syncs[0].ongoing = { mode: 'poll', every: '15m' };
        const { inst } = setup([def]);
        await inst.initialize();
        expect(await inst.events.SYNC_CONTACTS_ONGOING.handler({ data: { integrationId: 'int1', scheduleKey: 'SYNC_CONTACTS_ONGOING', tick: {} } })).toEqual({ source: { marked: expect.any(String) } });
        expect(await inst.events.SYNC_CONTACTS_PAGE.handler({ data: { runId: 'gone', role: 'source', cursor: null } })).toMatchObject({ stale: true });
    });

    it('GET /api/integrations/:id/syncs returns the same progress, to the owner only', async () => {
        const { inst } = setup();
        await inst.initialize();
        await inst.events.SYNC_CONTACTS_BACKFILL.handler({});
        const app = express();
        const authenticateUser = { execute: async (req) => { if (req.headers.authorization !== 'Bearer t') { const e = new Error('no'); e.status = 401; throw e; } return { getId: () => 'u1' }; } };
        const getIntegrationInstance = { execute: async (id, userId) => { if (userId !== 'u1' || id !== 'int1') { const e = new Error('nf'); e.status = 404; throw e; } return inst; } };
        setIntegrationRuntimeRoutes(app, authenticateUser, { getIntegrationInstance, integrationClasses: [inst.constructor] });
        app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message })); // eslint-disable-line no-unused-vars
        expect((await request(app).get('/api/integrations/int1/syncs')).status).toBe(401);
        const r = await request(app).get('/api/integrations/int1/syncs').set('authorization', 'Bearer t');
        expect(r.status).toBe(200);
        expect(r.body.syncs).toEqual([expect.objectContaining({ id: 'contacts', backfill: expect.objectContaining({ status: 'running', reason: 'user' }) })]);
    });

    it('a sync set to backfill on install starts at onCreate; an upgrade that changes identity keys relinks', async () => {
        const v1 = defWithSyncWorkflow();
        v1.syncs[0].backfill.trigger = 'onInstall';
        const v2 = JSON.parse(JSON.stringify(v1));
        v2.version = '2.0.0';
        v2.syncs[0].identity.match = v2.syncs[0].identity.match.filter((m) => m.key === 'email');
        const { inst, hubspot, quo } = setup([v1, v2]);
        await inst.initialize();
        hubspot.seed({ firstname: 'Ola', email: 'ola@x.com' });
        await inst.onCreate({});
        expect(inst.queue.map((m) => m.event)).toEqual(['SYNC_CONTACTS_PAGE']);
        await inst.drain();
        expect(quo.records.size).toBe(1);

        const up = await inst.upgradeTo('2.0.0', { apply: true });
        expect(up.applied).toBe(true);
        expect(up.actions).toContainEqual(expect.objectContaining({ kind: 'relink', id: 'contacts' }));
        expect(inst.queue).toEqual([expect.objectContaining({ event: 'SYNC_CONTACTS_PAGE', definitionVersion: '2.0.0' })]);
        await inst.drain();
        expect((await inst.syncStatus())[0].backfill).toMatchObject({ reason: 'relink', status: 'completed' });
        expect(quo.records.size).toBe(1);                       // relinking rewrites links; it creates nothing
    });
});
