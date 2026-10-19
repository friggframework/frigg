const d = require('..');
const { checksum } = require('../canonical');

const manifests = d.loadManifests();
const base = () => JSON.parse(JSON.stringify(require('../examples/quo-hubspot.definition.json')));
const quoCall = () => JSON.parse(JSON.stringify(manifests.quo.events['call.completed'].payload));

function harness(seed = {}) {
    const store = new Map(Object.entries(seed));
    const calls = [];
    const ports = (def, respond = () => ({ id: 'out_1' })) => d.makePorts({
        def, manifests,
        store: { get: async (k) => store.get(k) || null, put: async (k, v) => { store.set(k, v); }, claim: async (k, v) => { if (store.has(k)) return false; store.set(k, v); return true; }, release: async (k) => { store.delete(k); } },
        callApi: async (module, method, args) => { calls.push({ module, method, args }); return respond(module, method, args); },
        runCode: async (ref, args) => ({ participants: ['+15125550142'], ref, args }),
    });
    return { store, calls, ports };
}
const linked = { 'idx:contacts:phone:+15125550142': { hubspot: '51', quo: 'CT7' } };

describe('expressions', () => {
    it('resolves references with their type, templates as strings, and conditions without eval', () => {
        const ctx = { event: { n: 3, tags: ['vip'] }, steps: { c: null } };
        expect(d.execute).toBeDefined();
        const { resolve, evaluate } = require('../expressions');
        expect(resolve({ a: '$.event.n', b: 'n={{event.n}}' }, ctx)).toEqual({ a: 3, b: 'n=3' });
        expect(evaluate("$.steps.c == null && $.event.n > 2 && $.event.tags contains 'vip'", ctx)).toBe(true);
        expect(() => evaluate('process.exit()', ctx)).toThrow(/Cannot parse/);
    });
});

describe('validate', () => {
    it('accepts every bundled example against the bundled manifests', () => {
        for (const def of d.loadExamples()) {
            const r = d.validate(def, manifests);
            expect({ id: def.id, errors: r.errors }).toEqual({ id: def.id, errors: [] });
        }
    });

    // Each mutation breaks exactly one rule, so each rule is shown to be enforced on its own.
    const cases = [
        ['unknown capability', (x) => { x.workflows[0].steps[3].use = 'hubspot.call.teleport'; }, /no capability "call.teleport"/],
        ['missing required argument', (x) => { delete x.workflows[0].steps[3].with.contactId; }, /contactId.*Required/s],
        ['undeclared argument', (x) => { x.workflows[0].steps[3].with.color = 'red'; }, /takes no argument "color"/],
        ['step referenced before it runs', (x) => { x.workflows[0].steps[0].with.key.phone = '$.steps.engagement.id'; }, /not an earlier step/],
        ['undeclared workflow setting', (x) => { x.workflows[2].steps[3].with.properties.hs_task_body = '{{settings.nope}}'; }, /\$\.settings\.nope/],
        ['unknown trigger topic', (x) => { x.workflows[0].trigger.topic = 'call.teleported'; }, /emits no event "call.teleported"/],
        ['identity key not in the sync', (x) => { x.workflows[0].steps[0].with.key = { fax: '$.record.from' }; }, /"fax" is not an identity key/],
        ['mapping field the object lacks', (x) => { x.syncs[0].mapping[0].target = 'defaultFields.nickname'; }, /not a field of quo\.contact/],
        ['read-only target field', (x) => { x.syncs[0].mapping.push({ source: 'properties.email', target: 'id' }); }, /read-only/],
        ['placement the host lacks', (x) => { x.ui[0].placement = 'crm.navbar'; }, /not a placement hubspot supports/],
        ['button pointing at a non-user-action workflow', (x) => { x.ui[0].view.children[4].props.action.workflow = 'log-call'; }, /not triggered by a user action/],
        ['bad condition', (x) => { x.workflows[2].trigger.filter = "$.record.direction = 'incoming'"; }, /Cannot parse/],
        ['$.item outside foreach', (x) => { x.workflows[0].steps[3].with.properties.hs_call_title = '$.item.id'; }, /only available inside foreach/],
        ['duplicate ids across kinds', (x) => { x.queries[0].id = 'log-call'; }, /Duplicate id "log-call"/],
        ['unknown template', (x) => { x.workflows[0].steps[2].with.id = 'nope'; }, /Unknown template "nope"/],
    ];
    it.each(cases)('rejects: %s', (_, mutate, pattern) => {
        const x = base(); mutate(x);
        const r = d.validate(x, manifests);
        expect(r.valid).toBe(false);
        expect(r.errors.map((e) => `${e.path}: ${e.message}`).join("\n")).toMatch(pattern);
    });
});

describe('compile', () => {
    it('compiles only what the installation turned on, into ordinary Frigg events', () => {
        const def = base();
        const c = d.compile(def, { workflows: { 'missed-call-task': { enabled: true }, 'texts-timeline': { enabled: false } } });
        expect(c.events.WF_LOG_CALL).toMatchObject({ type: 'WEBHOOK' });
        expect(c.events.WF_MISSED_CALL_TASK).toBeDefined();            // default off, turned on
        expect(c.events.WF_TEXTS_TIMELINE).toBeUndefined();            // default on, turned off
        expect(c.events.WF_WON_THANK_YOU).toBeUndefined();             // default off, left off
        expect(c.events.SYNC_CONTACTS_BACKFILL).toMatchObject({ type: 'USER_ACTION', userActionType: 'SYNC_ACTION' });
        expect(c.events.WF_TEXT_FROM_CARD).toMatchObject({ type: 'USER_ACTION' });
        expect(c.schedules).toEqual([]);                                 // stale-contacts is off
        expect(d.routeWebhook(c, 'quo', 'call.completed')).toEqual(['WF_LOG_CALL']);
        expect(d.routeWebhook(c, 'hubspot', 'contact.propertyChange')).toEqual(['SYNC_CONTACTS_ONGOING']);
        expect(c.routes.map((r) => r.path)).toEqual(['/ui/quo-card', '/ui/deals-panel']);
    });
});

describe('runWorkflow', () => {
    it('logs a Quo call on the linked HubSpot contact, through the manifest method, with resolved arguments', async () => {
        const def = base(); const h = harness(linked);
        const run = await d.runWorkflow({ def, installation: {}, workflowId: 'log-call', event: quoCall(), ports: h.ports(def), manifests });
        expect(run.status).toBe('completed');
        expect(h.calls).toEqual([{ module: 'hubspot', method: 'createCallEngagement', args: {
            contactId: '51',
            properties: { hs_call_title: 'Quo call (incoming)', hs_call_body: 'Quo call with +15125550142 · 312s (completed)', hs_call_duration: 312, hs_call_direction: 'INCOMING', hs_timestamp: '2026-10-18T14:07:12Z' },
        } }]);
    });

    it('runs each provider event once: a redelivery writes nothing', async () => {
        const def = base(); const h = harness(linked); const p = h.ports(def);
        await d.runWorkflow({ def, installation: {}, workflowId: 'log-call', event: quoCall(), ports: p, manifests });
        const again = await d.runWorkflow({ def, installation: {}, workflowId: 'log-call', event: quoCall(), ports: p, manifests });
        expect(again.status).toBe('duplicate');
        expect(h.calls).toHaveLength(1);
    });

    it('a failed run gives its claim back, so the retry runs the steps instead of reading as a duplicate', async () => {
        const def = base(); const h = harness(linked);
        let fail = true;
        const p = h.ports(def, () => { if (fail) throw new Error('HubSpot 503'); return { id: 'out_1' }; });
        const first = await d.runWorkflow({ def, installation: {}, workflowId: 'log-call', event: quoCall(), ports: p, manifests });
        expect(first).toMatchObject({ status: 'failed', retryable: true });
        fail = false;
        const retry = await d.runWorkflow({ def, installation: {}, workflowId: 'log-call', event: quoCall(), ports: p, manifests });
        expect(retry.status).toBe('completed');
        expect(h.calls).toHaveLength(2);
    });

    it('stops (not fails) when there is no linked contact, and writes nothing', async () => {
        const def = base(); const h = harness();
        const run = await d.runWorkflow({ def, installation: {}, workflowId: 'log-call', event: quoCall(), ports: h.ports(def), manifests });
        expect(run).toMatchObject({ status: 'stopped', reason: 'No linked HubSpot contact for this number' });
        expect(h.calls).toEqual([]);
    });

    it('applies the trigger filter before claiming the event', async () => {
        const def = base(); const h = harness(linked);
        const ev = JSON.parse(JSON.stringify(manifests.quo.events['call.missed'].payload)); ev.data.object.direction = 'outgoing';
        const run = await d.runWorkflow({ def, installation: {}, workflowId: 'missed-call-task', event: ev, ports: h.ports(def), manifests });
        expect(run.status).toBe('filtered');
        expect([...h.store.keys()].some((k) => k.startsWith('evt:'))).toBe(false);
    });

    it('uses installation settings over defaults (missed-call owner)', async () => {
        const def = base(); const h = harness(linked);
        const respond = (m, method) => (method === 'getContactById' ? { id: '51', properties: { firstname: 'Dana', hubspot_owner_id: '999' } } : { id: 't1' });
        const run = await d.runWorkflow({ def, installation: { workflows: { 'missed-call-task': { enabled: true, settings: { owner: '81273645' } } } }, workflowId: 'missed-call-task', event: manifests.quo.events['call.missed'].payload, ports: h.ports(def, respond), manifests });
        expect(run.status).toBe('completed');
        const task = h.calls.find((c) => c.method === 'createTask');
        expect(task.args.properties).toMatchObject({ hs_task_subject: 'Call back Dana (missed Quo call)', hubspot_owner_id: '81273645' });
    });

    it('reports a failed step as a retryable failed run with the trace up to the failure', async () => {
        const def = base(); const h = harness(linked);
        const run = await d.runWorkflow({ def, installation: {}, workflowId: 'log-call', event: quoCall(), ports: h.ports(def, () => { throw new Error('HubSpot 503'); }), manifests });
        expect(run).toMatchObject({ status: 'failed', error: 'HubSpot 503', retryable: true });
        expect(run.trace.map((t) => t.status)).toEqual(['ok', 'skipped', 'ok', 'error']);
    });

    it('runs foreach with $.item and caps it', async () => {
        const def = base(); const h = harness();
        const respond = (m, method) => (method === 'searchContacts' ? { total: 2, results: [{ id: 'a', properties: { notes_last_contacted: 'x' } }, { id: 'b', properties: {} }] } : {});
        const run = await d.runWorkflow({ def, installation: {}, workflowId: 'stale-contacts', event: {}, ports: h.ports(def, respond), manifests });
        expect(run.status).toBe('completed');
        expect(h.calls.filter((c) => c.method === 'updateContact').map((c) => c.args.id)).toEqual(['a', 'b']);
    });
});

describe('renderSurface', () => {
    it('runs the query and resolves the view into a static tree for the host renderer', async () => {
        const def = base(); const h = harness();
        const respond = (m, method) => (method === 'listCalls' ? [{ direction: 'incoming', duration: 60, createdAt: '2026-10-18T14:00:00Z' }] : []);
        const out = await d.renderSurface({ def, installation: {}, surfaceId: 'quo-card', record: { properties: { phone: '+15125550142' } }, ports: h.ports(def, respond) });
        expect(out.surface).toEqual({ id: 'quo-card', host: 'hubspot', placement: 'crm.record.sidebar', definition: 'quo-hubspot@1.4.0' });
        const list = out.view.children.find((c) => c.component === 'List');
        expect(list.props.items).toEqual([{ title: 'incoming call · 60s', meta: '2026-10-18' }]);
        expect(out.view.children.some((c) => c.component === 'Empty')).toBe(false);
    });
});

describe('versioning', () => {
    it('classifies changes and refuses a bump smaller than the change', () => {
        const a = base(); const b = base(); b.version = '1.4.1';
        b.workflows[0].steps[3].with.properties.hs_call_title = 'Call';
        expect(d.checkBump(a, b)).toMatchObject({ ok: true, required: 'patch' });
        b.syncs[0].identity.match.pop();
        expect(d.checkBump(a, b)).toMatchObject({ ok: false, required: 'major', declared: 'patch' });
    });

    it('plans an upgrade: required input first, then what the runtime does', () => {
        const a = base(); const b = base(); b.version = '2.0.0';
        b.workflows = b.workflows.filter((w) => w.id !== 'texts-timeline');
        b.workflows.push({ id: 'voicemail', label: 'Voicemail notes', default: 'on', settings: { pipeline: { type: 'string', label: 'Pipeline', required: true } }, trigger: { type: 'webhook', module: 'quo', topic: 'call.missed' }, steps: [{ use: 'stop' }] });
        const plan = d.planUpgrade({ definition: { id: a.id, version: a.version }, settings: { fromNumber: '+1' }, workflows: { 'texts-timeline': { enabled: true } } }, a, b);
        expect(plan.allowed).toBe(false);
        expect(plan.needs).toEqual([expect.objectContaining({ path: 'workflows.voicemail.settings.pipeline' })]);
        expect(plan.actions.map((x) => x.kind)).toEqual(['disable', 'enable', 'drain']);
        expect(plan.config.definition.version).toBe('2.0.0');
        expect(plan.config.workflows['texts-timeline']).toBeUndefined();
    });

    it('stores versions under a canonical checksum that ignores key order', () => {
        expect(checksum({ a: 1, b: [1, { c: 2, d: 3 }] })).toBe(checksum({ b: [1, { d: 3, c: 2 }], a: 1 }));
    });
});

describe('defineIntegrationClass', () => {
    class FakeBase {
        constructor(p = {}) { this.events = {}; this.config = p.config; this.id = p.id; this.rows = new Map(); this.hubspot = { api: { createCallEngagement: jest.fn(async () => ({ id: 'e1' })) } }; this.quo = { api: {} }; }
        registerEventHandlers() { this.on = { ...this.events }; }
        async getMapping(k) { return this.rows.has(k) ? { mapping: this.rows.get(k) } : null; }
        async upsertMapping(k, v) { this.rows.set(k, v); }
        async createMapping(k, v) { if (this.rows.has(k)) { const e = new Error('exists'); e.name = 'MappingAlreadyExistsError'; throw e; } this.rows.set(k, v); }
    }

    it('loads the pinned version, builds this.events, and a dispatched webhook event writes to HubSpot', async () => {
        const v14 = base(); const v13 = { ...base(), version: '1.3.2' };
        const Cls = d.defineIntegrationClass({ id: 'quo-hubspot', definitions: d.memoryDefinitions([v13, v14]), manifests, modules: { quo: {}, hubspot: {} }, IntegrationBase: FakeBase, runs: false });
        expect(Cls.Definition.name).toBe('quo-hubspot');
        const inst = new Cls({ id: 'int_1', config: { definition: { id: 'quo-hubspot', version: '1.3.2' } } });
        await inst.loadDefinition();
        expect(inst.def.version).toBe('1.3.2');                              // the pin, not the latest
        expect(Object.keys(inst.on)).toContain('WF_LOG_CALL');
        inst.rows.set('idx:contacts:phone:+15125550142', { hubspot: '51', quo: 'CT7' });
        const run = await inst.on.WF_LOG_CALL.handler({ data: { body: quoCall(), definitionVersion: '1.3.2' } });
        expect(run.status).toBe('completed');
        expect(inst.hubspot.api.createCallEngagement).toHaveBeenCalledWith(expect.objectContaining({ hs_call_direction: 'INCOMING' }), '51'); // (properties, contactId)
    });

    it('shared class: one registration runs installations of different definitions', async () => {
        const qh = base(); const other = { ...base(), id: 'quo-other', version: '0.1.0' };
        const Cls = d.defineSharedIntegrationClass({ definitions: d.memoryDefinitions([qh, other]), manifests, modules: { quo: {}, hubspot: {} }, IntegrationBase: FakeBase, runs: false });
        expect(Cls.Definition.name).toBe('integration-runtime');
        expect(Object.keys(Cls.Definition.modules)).toEqual(['quo', 'hubspot']);
        const a = new Cls({ id: 'int_a', config: { definition: { id: 'quo-hubspot', version: '1.4.0' } } });
        const b = new Cls({ id: 'int_b', config: { definition: { id: 'quo-other', version: '0.1.0' } } });
        await a.loadDefinition(); await b.loadDefinition();
        expect([a.def.id, b.def.id]).toEqual(['quo-hubspot', 'quo-other']);
        await expect(new Cls({ id: 'int_c', config: {} }).loadDefinition()).rejects.toThrow(/does not name a definition/);
    });
});
