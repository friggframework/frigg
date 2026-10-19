/**
 * The HTTP adapter (router.js) over a real express app, and the class's upgrade and run recording. Authentication
 * and integration lookup are the router's injected dependencies; the use cases, catalogue logic and class are real.
 */
const express = require('express');
const request = require('supertest');
const d = require('..');
const { setDataDefinedRoutes } = require('../router');

const manifests = d.loadManifests();
const example = (id) => JSON.parse(JSON.stringify(d.loadExamples().find((x) => x.id === id)));

/** An in-memory DefinitionVersion repository with the real repository's contract (incl. the status precondition). */
function memoryRepository() {
    const rows = new Map();
    const key = (id, v) => `${id}@${v}`;
    let n = 0;
    return {
        rows,
        async findVersion(id, v) { return rows.get(key(id, v)) || null; },
        async listVersions(id) { return [...rows.values()].filter((r) => r.definitionId === id); },
        async listByStatus(statuses) { return [...rows.values()].filter((r) => statuses.includes(r.status)).map(({ document, ...m }) => m); },
        async createVersion(data) { if (rows.has(key(data.definitionId, data.version))) { const e = new Error('unique'); e.code = 'P2002'; throw e; } const r = { id: String(++n), createdAt: new Date(), ...data }; rows.set(key(data.definitionId, data.version), r); return r; },
        async updateIfStatus(id, v, from, data) { const r = rows.get(key(id, v)); if (!r || r.status !== from) return null; Object.assign(r, data); return r; },
    };
}

class FakeBase {
    constructor(p = {}) { this.events = {}; this.config = p.config; this.id = p.id; this.patched = []; this.rows = new Map(); }
    async initialize() { this.registerEventHandlers(); }
    registerEventHandlers() { this.on = { ...this.events }; }
    async patchConfig(c) { this.patched.push(c); this.config = { ...this.config, ...c }; }
    async onCreate() {}
    async getMapping(k) { return this.rows.has(k) ? { mapping: this.rows.get(k) } : null; }
    async upsertMapping(k, v) { this.rows.set(k, v); }
    async createMapping(k, v) { if (this.rows.has(k)) { const e = new Error('exists'); e.name = 'MappingAlreadyExistsError'; throw e; } this.rows.set(k, v); }
    async deleteMapping(k) { this.rows.delete(k); }
}

async function setup({ adminKey = 'admin-secret' } = {}) {
    process.env.ADMIN_API_KEY = adminKey;
    const repository = memoryRepository();
    const catalog = d.createDefinitionCatalog({ repository });
    const runStore = { runs: [], async createRun(r) { this.runs.push(r); return r; }, async listRuns(id, q = {}) { return this.runs.filter((r) => r.integrationId === id && (!q.workflowId || r.workflowId === q.workflowId)); } };
    const Cls = d.defineSharedIntegrationClass({ definitions: catalog, manifests, modules: { quo: {}, hubspot: {} }, IntegrationBase: FakeBase, runs: runStore });
    const installations = new Map();
    const app = express();
    app.use(express.json());
    const users = { 'token-a': 'user-a', 'token-b': 'user-b' };
    const authenticateUser = { execute: async (req) => { const u = users[(req.headers.authorization || '').replace('Bearer ', '')]; if (!u) { const e = new Error('Unauthorized'); e.status = 401; throw e; } return { getId: () => u }; } };
    const getIntegrationInstance = { execute: async (id, userId) => { const i = installations.get(id); if (!i || i.userId !== userId) { const e = new Error('Not found'); e.status = 404; throw e; } await i.inst.initialize(); return i.inst; } };
    expect(setDataDefinedRoutes(app, authenticateUser, { getIntegrationInstance, integrationClasses: [Cls] })).toBe(true);
    app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message })); // eslint-disable-line no-unused-vars
    const install = (id, userId, config, apis = {}) => { const inst = new Cls({ id, config: { type: 'data-defined', ...config } }); Object.assign(inst, apis); installations.set(id, { inst, userId }); return inst; };
    const publishAs = (document, key = adminKey) => request(app).post('/admin/integrations/definitions').set('x-frigg-admin-api-key', key).send({ document });
    return { app, repository, catalog, runStore, install, publishAs, Cls };
}

describe('admin routes: publishing', () => {
    it('refuses without the admin key, publishes with it (201), and is idempotent on the same document (200)', async () => {
        const { publishAs } = await setup();
        expect((await publishAs(example('quo-hubspot'), 'wrong')).status).toBe(401);
        const first = await publishAs(example('quo-hubspot'));
        expect(first.status).toBe(201);
        expect(first.body.version).toMatchObject({ definitionId: 'quo-hubspot', version: '1.4.0', status: 'PUBLISHED' });
        expect(first.body.version.document).toBeUndefined();
        expect((await publishAs(example('quo-hubspot'))).status).toBe(200);
    });

    it('answers an invalid document with 400 and both layers\' errors; a too-small bump with 409 and the changes', async () => {
        const { publishAs } = await setup();
        const bad = example('quo-hubspot'); bad.syncs[0].mapping[0].transform = 'shout';
        const r = await publishAs(bad);
        expect(r.status).toBe(400);
        expect(r.body.code).toBe('INVALID');
        expect(r.body.details.errors.map((e) => e.layer)).toEqual(['schema', 'references']);
        await publishAs(example('quo-hubspot'));
        const v = example('quo-hubspot'); v.version = '1.4.1'; v.workflows = v.workflows.filter((w) => w.id !== 'won-thank-you');
        const bump = await publishAs(v);
        expect(bump.status).toBe(409);
        expect(bump.body).toMatchObject({ code: 'BUMP_TOO_SMALL', details: { required: 'major', declared: 'patch' } });
    });

    it('history and deprecation', async () => {
        const { app, publishAs } = await setup();
        await publishAs(example('quo-hubspot'));
        const h = await request(app).get('/admin/integrations/definitions/quo-hubspot').set('x-frigg-admin-api-key', 'admin-secret');
        expect(h.body.versions.map((x) => x.version)).toEqual(['1.4.0']);
        const dep = await request(app).post('/admin/integrations/definitions/quo-hubspot/versions/1.4.0/deprecate').set('x-frigg-admin-api-key', 'admin-secret');
        expect(dep.body.version.status).toBe('DEPRECATED');
        expect((await request(app).post('/admin/integrations/definitions/quo-hubspot/versions/1.4.0/deprecate').set('x-frigg-admin-api-key', 'admin-secret')).status).toBe(409);
    });
});

describe('user routes: catalogue, upgrade, runs', () => {
    it('lists what can be installed to a signed-in user only', async () => {
        const { app, publishAs } = await setup();
        await publishAs(example('quo-hubspot'));
        await publishAs(example('pipedrive-hubspot'));
        expect((await request(app).get('/api/data-defined/definitions')).status).toBe(401);
        const r = await request(app).get('/api/data-defined/definitions').set('authorization', 'Bearer token-a');
        expect(r.body.definitions.map((x) => x.id).sort()).toEqual(['pipedrive-hubspot', 'quo-hubspot']);
    });

    it('plans an upgrade without changing anything, then refuses to apply while a required setting is missing', async () => {
        const { app, publishAs, install } = await setup();
        await publishAs(example('quo-hubspot'));
        const v2 = example('quo-hubspot'); v2.version = '2.0.0'; v2.settings.region = { type: 'string', label: 'Region', required: true };
        expect((await publishAs(v2)).status).toBe(201);
        const inst = install('int_1', 'user-a', { definition: { id: 'quo-hubspot', version: '1.4.0' }, settings: { fromNumber: '+15125550100' } });
        const plan = await request(app).get('/api/integrations/int_1/upgrade').set('authorization', 'Bearer token-a');
        expect(plan.status).toBe(200);
        expect(plan.body).toMatchObject({ from: '1.4.0', to: '2.0.0', allowed: false, applied: false });
        expect(plan.body.needs).toEqual([expect.objectContaining({ kind: 'setting', path: 'settings.region' })]);
        expect(inst.patched).toEqual([]);
        const apply = await request(app).post('/api/integrations/int_1/upgrade').set('authorization', 'Bearer token-a').send({});
        expect(apply.status).toBe(409);
        expect(inst.config.definition.version).toBe('1.4.0');
        expect((await request(app).get('/api/integrations/int_1/upgrade').set('authorization', 'Bearer token-b')).status).toBe(404);
    });

    it('applies an upgrade: undoes the old install steps, runs the new ones, moves the pin with its checksum', async () => {
        const { app, publishAs, install, catalog } = await setup();
        await publishAs(example('quo-hubspot'));
        const v15 = example('quo-hubspot'); v15.version = '1.5.0';
        v15.lifecycle.onInstall[0].with.events = [...v15.lifecycle.onInstall[0].with.events, 'message.delivered'];
        expect((await publishAs(v15)).body.changeLevel).toBe('minor');
        const calls = [];
        const inst = install('int_2', 'user-a', { definition: { id: 'quo-hubspot', version: '1.4.0' }, settings: { fromNumber: '+15125550100' }, runtime: { installed: { hook: { id: 'WH_old' } } } }, {
            quo: { api: { createWebhook: async (a) => { calls.push(['create', a.events.length]); return { id: 'WH_new' }; }, deleteWebhook: async (a) => { calls.push(['delete', a.id]); } } },
            hubspot: { api: {} },
        });
        const r = await request(app).post('/api/integrations/int_2/upgrade').set('authorization', 'Bearer token-a').send({ to: '1.5.0' });
        expect(r.status).toBe(200);
        expect(r.body.applied).toBe(true);
        expect(calls).toEqual([['delete', 'WH_old'], ['create', 6]]);
        expect(inst.config.definition).toEqual({ id: 'quo-hubspot', version: '1.5.0', checksum: await catalog.checksumOf('quo-hubspot', '1.5.0') });
        expect(inst.config.runtime.installed).toEqual({ hook: { id: 'WH_new' } });
        expect(inst.def.version).toBe('1.5.0');
    });

    it('records each workflow run (a store failure never fails the run) and lists runs for the owner', async () => {
        const { app, publishAs, install, runStore } = await setup();
        await publishAs(example('quo-hubspot'));
        const createCallEngagement = jest.fn(async () => ({ id: 'e1' }));
        const inst = install('int_3', 'user-a', { definition: { id: 'quo-hubspot', version: '1.4.0' } }, { quo: { api: {} }, hubspot: { api: { createCallEngagement } } });
        await inst.initialize();
        inst.rows.set('idx:contacts:phone:+15125550142', { hubspot: '51', quo: 'CT7' });
        const body = JSON.parse(JSON.stringify(manifests.quo.events['call.completed'].payload));
        await inst.on.WF_LOG_CALL.handler({ data: { body, eventId: 'EVc0a1' } });
        expect(runStore.runs).toEqual([expect.objectContaining({ integrationId: 'int_3', workflowId: 'log-call', status: 'completed', definitionId: 'quo-hubspot', definitionVersion: '1.4.0', triggerType: 'webhook', eventId: 'EVc0a1' })]);
        const listed = await request(app).get('/api/integrations/int_3/runs?workflowId=log-call').set('authorization', 'Bearer token-a');
        expect(listed.body.runs).toHaveLength(1);
        runStore.createRun = async () => { throw new Error('database down'); };
        const again = await inst.on.WF_LOG_CALL.handler({ data: { body: { ...body, id: 'x' }, eventId: 'EVc0a2' } });
        expect(again.status).toBe('completed');
    });
});

describe('installing by id alone', () => {
    it('pins the latest published version and its checksum, and persists the pin at install', async () => {
        const { publishAs, install, catalog } = await setup();
        await publishAs(example('quo-hubspot'));
        const inst = install('int_4', 'user-a', { definition: { id: 'quo-hubspot' } }, { quo: { api: { createWebhook: async () => ({ id: 'WH1' }) } }, hubspot: { api: {} } });
        await inst.initialize();
        expect(inst.config.definition).toEqual({ id: 'quo-hubspot', version: '1.4.0', checksum: await catalog.checksumOf('quo-hubspot', '1.4.0') });
        await inst.onCreate({});
        expect(inst.patched.at(-1).definition).toEqual(inst.config.definition);
    });

    it('refuses to load a version whose content no longer matches the pinned checksum', async () => {
        const { publishAs, install } = await setup();
        await publishAs(example('quo-hubspot'));
        const inst = install('int_5', 'user-a', { definition: { id: 'quo-hubspot', version: '1.4.0', checksum: 'sha256:tampered' } });
        await expect(inst.initialize()).rejects.toMatchObject({ code: 'CHECKSUM_MISMATCH' });
    });
});
