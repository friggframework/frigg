/**
 * The sync engine against in-memory HubSpot and Quo APIs that behave like the real ones as the manifests describe
 * them (list pages, search by key, create returns the record). Assertions are on what was written to each side.
 */
const d = require('..');
const { makePorts, installContext, argumentsFor } = require('../runtime');
const { createSyncEngine } = require('../sync-engine');

const manifests = d.loadManifests();
const example = (id) => JSON.parse(JSON.stringify(d.loadExamples().find((x) => x.id === id)));

const { hubspotApi, quoApi } = require('./helpers-fake-crm');

function setup({ def = example('quo-hubspot'), installation = {} } = {}) {
    const rows = new Map();
    const store = { get: async (k) => rows.get(k) ?? null, put: async (k, v) => { rows.set(k, JSON.parse(JSON.stringify(v))); }, claim: async (k, v) => (rows.has(k) ? false : (rows.set(k, v), true)) };
    const apis = { hubspot: hubspotApi(), quo: quoApi() };
    const ports = makePorts({ def, manifests, store, callApi: (k, method, args, order) => apis[k][method](...argumentsFor(args, order)) });
    const inst = { definition: { id: def.id, version: def.version }, ...installation };
    const engine = createSyncEngine({ def, installation: inst, install: installContext(def, inst), manifests, ports, state: store });
    const backfill = async (syncId = def.syncs[0].id) => {
        let step = await engine.startBackfill({ syncId, runId: 'r1' });
        const seen = [];
        while (step.next) { seen.push(step.next); step = await engine.continueBackfill({ syncId, ...step.next }); }
        return { progress: step.progress, steps: seen };
    };
    return { def, rows, apis, engine, backfill, store };
}

const hubspotEvent = (objectId, type = 'contact.propertyChange') => [{ portalId: 1944396, objectId, subscriptionType: type, eventId: Math.random() }];

describe('backfill', () => {
    it('two-way: links matches by identity, creates the rest on each side, and writes nothing twice', async () => {
        const t = setup();
        const ada = t.apis.hubspot.seed({ firstname: 'Ada', lastname: 'L', email: 'ADA@X.COM', phone: '(512) 555-0101' });
        t.apis.hubspot.seed({ firstname: 'Bo', email: 'bo@x.com' });
        const quoAda = t.apis.quo.seed({ firstName: 'Ada', phoneNumbers: [{ value: '+15125550101' }] });
        t.apis.quo.seed({ firstName: 'Cy', phoneNumbers: [{ value: '+15125550199' }] });

        const { progress, steps } = await t.backfill();
        expect(steps.map((s) => s.role)).toEqual(['source', 'target']);
        expect(progress).toMatchObject({ status: 'completed', pages: 2 });
        // Ada: found in Quo by her normalised phone and linked (HubSpot is master, so her name and email flow over).
        expect(t.apis.quo.searches[0]).toEqual({ email: 'ada@x.com', phone: '+15125550101' });
        expect(t.apis.quo.writes).toEqual([
            ['update', quoAda, { firstName: 'Ada', lastName: 'L', emails: [{ value: 'ada@x.com' }], phoneNumbers: [{ value: '+15125550101' }] }],
            ['create', { firstName: 'Bo', emails: [{ value: 'bo@x.com' }] }, expect.any(String)],
        ]);
        // Cy exists only in Quo: created in HubSpot from Quo's side (a create takes every row flowing that way).
        expect(t.apis.hubspot.writes).toEqual([['create', { firstname: 'Cy', phone: '+15125550199' }]]);
        expect(progress.counts).toEqual({ linked: 1, created: 2, unchanged: 2 });
        expect(await t.store.get(`link:contacts:quo:${quoAda}`)).toMatchObject({ hubspot: ada, quo: quoAda });
        expect(await t.store.get('idx:contacts:email:ada@x.com')).toMatchObject({ hubspot: ada, quo: quoAda });

        // A second backfill finds everything linked and current: nothing is written.
        t.apis.hubspot.writes.length = 0; t.apis.quo.writes.length = 0;
        await t.store.put('sync:contacts:backfill', { ...(await t.store.get('sync:contacts:backfill')), status: 'completed' });
        let step = await t.engine.startBackfill({ syncId: 'contacts', runId: 'r2' });
        while (step.next) step = await t.engine.continueBackfill({ syncId: 'contacts', ...step.next });
        expect([t.apis.hubspot.writes, t.apis.quo.writes]).toEqual([[], []]);
    });

    it('pages until the cursor runs out, and records every page', async () => {
        const t = setup();
        t.def.syncs[0].direction = 'one_way';
        for (let i = 0; i < 230; i += 1) t.apis.hubspot.seed({ firstname: `P${i}`, email: `p${i}@x.com` });
        const { progress, steps } = await t.backfill();
        expect(steps.map((s) => s.cursor)).toEqual([null, '100', '200']);
        expect(progress).toMatchObject({ status: 'completed', pages: 3, counts: { created: 230 } });
        expect(t.apis.quo.records.size).toBe(230);
    });

    it('refuses a second backfill while one is running, and drops a page of a run that is no longer current', async () => {
        const t = setup();
        t.apis.hubspot.seed({ firstname: 'A', email: 'a@x.com' });
        const first = await t.engine.startBackfill({ syncId: 'contacts', runId: 'r1' });
        expect(first.started).toBe(true);
        expect((await t.engine.startBackfill({ syncId: 'contacts', runId: 'r2' })).started).toBe(false);
        expect(await t.engine.continueBackfill({ syncId: 'contacts', runId: 'old', role: 'source', cursor: null })).toMatchObject({ stale: true });
        expect(t.apis.quo.writes).toEqual([]);
    });

    it('keeps going past a record that fails, counting it and keeping a sample of the error', async () => {
        const t = setup();
        t.def.syncs[0].direction = 'one_way';
        t.apis.hubspot.seed({ firstname: 'Ok', email: 'ok@x.com' });
        t.apis.hubspot.seed({ firstname: 'Bad', email: 'bad@x.com' });
        const create = t.apis.quo.createContact;
        t.apis.quo.createContact = async (a) => { if (a.defaultFields.firstName === 'Bad') throw new Error('422 invalid'); return create(a); };
        const { progress } = await t.backfill();
        expect(progress.counts).toEqual({ created: 1, failed: 1 });
        expect(progress.errors).toEqual([{ role: 'source', id: expect.any(String), error: '422 invalid' }]);
    });
});

describe('one record', () => {
    it('ambiguous identity: skip by default, take the first or create when the definition says so', async () => {
        for (const [onAmbiguous, expected] of [['skip', 'skipped'], ['first', 'linked'], ['create', 'created']]) {
            const t = setup();
            t.def.syncs[0].identity.onAmbiguous = onAmbiguous;
            t.apis.quo.seed({ firstName: 'Twin1', phoneNumbers: [{ value: '+15125550111' }] });
            t.apis.quo.seed({ firstName: 'Twin2', phoneNumbers: [{ value: '+15125550111' }] });
            const id = t.apis.hubspot.seed({ firstname: 'Tess', phone: '+15125550111' });
            const out = await t.engine.syncRecord({ syncId: 'contacts', from: 'source', record: t.apis.hubspot.records.get(id) });
            expect(out.status).toBe(expected);
        }
    });

    it('master rules: on an update only rows mastered by the changed side flow; newest flows both ways', async () => {
        const t = setup();
        const hs = t.apis.hubspot.seed({ firstname: 'Ann', company: 'Old Co', email: 'ann@x.com' });
        await t.engine.syncRecord({ syncId: 'contacts', from: 'source', record: t.apis.hubspot.records.get(hs) });
        const [qId] = [...t.apis.quo.records.keys()];
        t.apis.hubspot.writes.length = 0;

        // A change in Quo: firstName and company rows are mastered by HubSpot (the default), so nothing flows back.
        Object.assign(t.apis.quo.records.get(qId).defaultFields, { firstName: 'Annie', company: 'New Co' });
        expect((await t.engine.syncRecord({ syncId: 'contacts', from: 'target', record: t.apis.quo.records.get(qId) })).status).toBe('unchanged');
        expect(t.apis.hubspot.writes).toEqual([]);

        // With company on master: newest, Quo's company change flows to HubSpot; firstName still does not.
        t.def.syncs[0].mapping.find((r) => r.target === 'defaultFields.company').master = 'newest';
        const out = await t.engine.syncRecord({ syncId: 'contacts', from: 'target', record: t.apis.quo.records.get(qId) });
        expect(out.status).toBe('updated');
        expect(t.apis.hubspot.writes).toEqual([['update', hs, { company: 'New Co' }]]);
    });

    it('the echo of its own write ends there: the other side\'s webhook writes nothing back', async () => {
        const t = setup();
        for (const r of t.def.syncs[0].mapping) r.master = 'newest';
        const hs = t.apis.hubspot.seed({ firstname: 'Eve', email: 'eve@x.com' });
        await t.engine.syncRecord({ syncId: 'contacts', from: 'source', record: t.apis.hubspot.records.get(hs) });
        const [qId] = [...t.apis.quo.records.keys()];
        t.apis.quo.writes.length = 0; t.apis.hubspot.writes.length = 0;

        // Quo tells us about the contact we just created: nothing flows back.
        const echo = { id: 'EV1', type: 'contact.updated', data: { object: t.apis.quo.records.get(qId) } };
        expect((await t.engine.handleEvent({ syncId: 'contacts', moduleKey: 'quo', topic: 'contact.updated', event: echo })).status).toBe('unchanged');

        // A real change in Quo flows to HubSpot once; HubSpot's echo of that write then flows nowhere.
        t.apis.quo.records.get(qId).defaultFields.firstName = 'Evelyn';
        expect((await t.engine.handleEvent({ syncId: 'contacts', moduleKey: 'quo', topic: 'contact.updated', event: echo })).status).toBe('updated');
        expect(t.apis.hubspot.writes).toEqual([['update', hs, { firstname: 'Evelyn' }]]);
        const back = await t.engine.handleEvent({ syncId: 'contacts', moduleKey: 'hubspot', topic: 'contact.propertyChange', event: hubspotEvent(hs)[0] });
        expect(back.status).toBe('unchanged');
        expect(t.apis.quo.writes).toEqual([]);
    });

    it('fetches the record when the event carries only an id (HubSpot), and uses the event body when it is the record (Quo)', async () => {
        const t = setup();
        const hs = t.apis.hubspot.seed({ firstname: 'Ida', email: 'ida@x.com' });
        const get = jest.spyOn(t.apis.hubspot, 'getContactById');
        const out = await t.engine.handleEvent({ syncId: 'contacts', moduleKey: 'hubspot', topic: 'contact.created', event: hubspotEvent(hs, 'contact.creation')[0] });
        expect(get).toHaveBeenCalledWith(hs);
        expect(out.status).toBe('created');
        expect(t.apis.quo.writes[0][1]).toEqual({ firstName: 'Ida', emails: [{ value: 'ida@x.com' }] });
    });

    it('a one-way sync ignores the target side, and a filter keeps records out', async () => {
        const t = setup();
        t.def.syncs[0].direction = 'one_way';
        const q = t.apis.quo.seed({ firstName: 'Only', phoneNumbers: [{ value: '+15125550177' }] });
        expect(await t.engine.syncRecord({ syncId: 'contacts', from: 'target', record: t.apis.quo.records.get(q) })).toEqual({ status: 'skipped', reason: 'one-way sync' });
        t.def.syncs[0].filter = "$.record.properties.lifecyclestage == 'customer'";
        const lead = t.apis.hubspot.seed({ firstname: 'L', email: 'l@x.com', lifecyclestage: 'lead' });
        expect((await t.engine.syncRecord({ syncId: 'contacts', from: 'source', record: t.apis.hubspot.records.get(lead) })).reason).toBe('filtered');
        expect(t.apis.hubspot.writes.concat(t.apis.quo.writes)).toEqual([]);
    });

    it('an installation\'s own mapping replaces the definition\'s', async () => {
        const t = setup({ installation: { syncs: { contacts: { mapping: [{ source: 'properties.email', target: 'defaultFields.emails[0].value', transform: 'lowercase' }] } } } });
        const hs = t.apis.hubspot.seed({ firstname: 'Mo', email: 'MO@X.COM' });
        await t.engine.syncRecord({ syncId: 'contacts', from: 'source', record: t.apis.hubspot.records.get(hs) });
        expect(t.apis.quo.writes).toEqual([['create', { emails: [{ value: 'mo@x.com' }] }, undefined]]);
    });
});

describe('guards', () => {
    it('master: newest does not overwrite a side that changed after the incoming record', async () => {
        const t = setup();
        for (const r of t.def.syncs[0].mapping) r.master = 'newest';
        const hs = t.apis.hubspot.seed({ firstname: 'Nia', email: 'nia@x.com' }, { updatedAt: '2026-10-01T00:00:00Z' });
        await t.engine.syncRecord({ syncId: 'contacts', from: 'source', record: t.apis.hubspot.records.get(hs) });
        const [qId] = [...t.apis.quo.records.keys()];
        // Quo changed at 10:00; then a HubSpot change stamped 09:00 arrives late (a delayed poll): Quo keeps its value.
        t.apis.quo.records.get(qId).defaultFields.firstName = 'Nina';
        t.apis.quo.records.get(qId).updatedAt = '2026-10-04T10:00:00Z';
        await t.engine.syncRecord({ syncId: 'contacts', from: 'target', record: t.apis.quo.records.get(qId) });
        t.apis.quo.writes.length = 0;
        const late = { ...t.apis.hubspot.records.get(hs), properties: { ...t.apis.hubspot.records.get(hs).properties, firstname: 'Nyah' }, updatedAt: '2026-10-04T09:00:00Z' };
        await t.engine.syncRecord({ syncId: 'contacts', from: 'source', record: late });
        expect(t.apis.quo.writes).toEqual([]);
        const later = { ...late, updatedAt: '2026-10-04T11:00:00Z' };
        await t.engine.syncRecord({ syncId: 'contacts', from: 'source', record: later });
        expect(t.apis.quo.writes).toEqual([['update', qId, { firstName: 'Nyah' }]]);
    });

    it('a list whose cursor does not move ends instead of looping', async () => {
        const t = setup();
        t.apis.hubspot.seed({ firstname: 'Loop', email: 'loop@x.com' });
        t.apis.hubspot.listContacts = async () => ({ results: [...t.apis.hubspot.records.values()], paging: { next: { after: 'same' } } });
        const first = await t.engine.readPage({ syncId: 'contacts', role: 'source', cursor: null, pageSize: 100 });
        expect(first.next).toBe('same');
        expect((await t.engine.readPage({ syncId: 'contacts', role: 'source', cursor: 'same', pageSize: 100 })).next).toBeNull();
    });

    it('validation: polling needs a modified-since list on every side it reads; a sync op needs the right kind of capability', () => {
        const def = example('quo-hubspot');
        def.syncs[0].ongoing = { mode: 'poll', every: '15m' };
        expect(d.validate(def, manifests).errors.map((e) => e.message)).toEqual(['Polling quo.contact needs sync.list with a modified-since argument']);
        const quo = JSON.parse(JSON.stringify(manifests.quo));
        quo.objects.contact.sync.create = { capability: 'contact.get' };
        expect(d.validateManifest(quo).errors).toEqual([{ path: 'objects.contact.sync.create.capability', message: 'create needs a write capability; contact.get is read' }]);
    });
});

describe('poll', () => {
    it('the first poll only sets the mark; later polls read what changed since, on both sides of a two-way sync', async () => {
        const t = setup();
        t.def.syncs[0].ongoing = { mode: 'poll', every: '15m' };
        const old = t.apis.hubspot.seed({ firstname: 'Old', email: 'old@x.com' }, { updatedAt: '2026-09-01T00:00:00Z' });
        const first = await t.engine.poll({ syncId: 'contacts' });
        expect(first.source).toEqual({ marked: expect.any(String) });
        expect(t.apis.quo.writes).toEqual([]);

        const st = await t.store.get('sync:contacts:poll');
        await t.store.put('sync:contacts:poll', { ...st, since: { source: '2026-09-15T00:00:00Z' } });
        const fresh = t.apis.hubspot.seed({ firstname: 'New', email: 'new@x.com' }, { updatedAt: '2026-10-05T00:00:00Z' });
        const second = await t.engine.poll({ syncId: 'contacts' });
        expect(second.source).toEqual({ pages: 1, counts: { created: 1 }, more: false });
        expect(t.apis.quo.writes.map((w) => w[1].firstName)).toEqual(['New']);
        expect((await t.store.get('sync:contacts:poll')).since.source).toBe('2026-10-05T00:00:00.000Z');
        expect(old && fresh).toBeTruthy();
        expect(second.target).toBeUndefined();                  // Quo cannot list by modified time: polled side only
    });

    it('stops at maxPages and carries on from the saved cursor next time, keeping the same mark', async () => {
        const t = setup();
        t.def.syncs[0].direction = 'one_way';
        t.def.syncs[0].backfill.pageSize = 2;
        for (let i = 0; i < 5; i += 1) t.apis.hubspot.seed({ firstname: `N${i}`, email: `n${i}@x.com` }, { updatedAt: `2026-10-0${i + 1}T00:00:00Z` });
        await t.store.put('sync:contacts:poll', { since: { source: '2026-09-01T00:00:00Z' }, cursor: {} });
        const a = await t.engine.poll({ syncId: 'contacts', maxPages: 2 });
        expect(a.source).toMatchObject({ pages: 2, more: true });
        expect((await t.store.get('sync:contacts:poll')).since.source).toBe('2026-09-01T00:00:00Z');
        const b = await t.engine.poll({ syncId: 'contacts', maxPages: 2 });
        expect(b.source).toMatchObject({ pages: 1, more: false });
        expect(t.apis.quo.records.size).toBe(5);
    });
});
