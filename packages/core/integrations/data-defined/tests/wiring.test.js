/**
 * The data-defined class inside Frigg's real entry points: initialize() hydration, webhook receipt (handshakes),
 * the worker turning a raw delivery into workflow messages (module, topic, batch, account, signature), app-level
 * fan-out, and the existing authenticated config-options and user-action routes. Only IntegrationBase is faked; the
 * class, compiler, runtime and webhook resolution are the real ones.
 */
const d = require('..');
const { eventsIn, handshakeFor } = require('../webhooks');

const manifests = d.loadManifests();
const example = (id) => JSON.parse(JSON.stringify(d.loadExamples().find((x) => x.id === id)));
const quoCall = () => JSON.parse(JSON.stringify(manifests.quo.events['call.completed'].payload));

class FakeBase {
    constructor(p = {}) {
        this.events = {}; this.config = p.config; this.id = p.id; this.rows = new Map(); this.queued = []; this.patched = [];
    }
    async initialize() { this.initialized = true; this.registerEventHandlers(); }
    registerEventHandlers() { this.on = { ...this.events }; }
    async send(event, payload) { return this.on[event].handler.call(this, payload); }
    async queueWebhook(data) { this.queued.push(data); }
    async onWebhookReceived({ req, res }) { await this.queueWebhook({ integrationId: req.params?.integrationId || null, body: req.body, headers: req.headers, query: req.query }); res.status(200).json({ received: true }); }
    async patchConfig(c) { this.patched.push(c); this.config = { ...this.config, ...c }; }
    async onUpdate(p) { if (p?.config) await this.patchConfig(p.config); }
    async onCreate() {} async onDelete() {}
    async getMapping(k) { return this.rows.has(k) ? { mapping: this.rows.get(k) } : null; }
    async upsertMapping(k, v) { this.rows.set(k, v); }
    async createMapping(k, v) { if (this.rows.has(k)) { const e = new Error('exists'); e.name = 'MappingAlreadyExistsError'; throw e; } this.rows.set(k, v); }
    async deleteMapping(k) { this.rows.delete(k); }
}
const res = () => { const r = { statusCode: null, headers: {}, body: undefined }; r.status = (c) => { r.statusCode = c; return r; }; r.set = (k, v) => { r.headers[k] = v; return r; }; r.json = (b) => { r.body = b; return r; }; r.send = (b) => { r.body = b; return r; }; return r; };

function shared(defs, { lookup, apis = {} } = {}) {
    const Cls = d.defineSharedIntegrationClass({ definitions: d.memoryDefinitions(defs), manifests, modules: { quo: {}, hubspot: {}, slack: {}, asana: {}, quickbooks: {}, pipedrive: {} }, IntegrationBase: FakeBase, lookup });
    return (config, id = 'int_1') => { const inst = new Cls({ id, config }); Object.assign(inst, apis); return inst; };
}
const pin = (def) => ({ definition: { id: def.id, version: def.version } });
const verified = (extra = {}) => ({ api: { verifyWebhookSignature: async () => true, ...extra }, entity: { externalId: '1944396' } });

describe('initialize() is where a real Frigg entry point hydrates the definition', () => {
    it('loads the pinned version and registers its events; a dry instance (no pin) loads nothing', async () => {
        const make = shared([example('quo-hubspot')]);
        const inst = make(pin(example('quo-hubspot')));
        await inst.initialize();
        expect(inst.def.version).toBe('1.4.0');
        expect(Object.keys(inst.on)).toContain('WF_LOG_CALL');
        const dry = make(undefined, undefined);
        await dry.initialize();
        expect(dry.def).toBeUndefined();
    });

    it('switching a workflow off removes its event on recompile (not just adds new ones)', async () => {
        const def = example('quo-hubspot');
        const inst = shared([def])(pin(def));
        await inst.initialize();
        expect(inst.events.WF_LOG_CALL).toBeDefined();
        await inst.onUpdate({ config: { workflows: { 'log-call': { enabled: false } } } });
        expect(inst.events.WF_LOG_CALL).toBeUndefined();
        expect(inst.on.WF_LOG_CALL).toBeUndefined();
    });

    it('calls a module by its module name when the definition names it by another key', async () => {
        const def = {
            schemaVersion: '0.1', id: 'renamed', version: '1.0.0', display: { label: 'Renamed keys' },
            modules: { phone: { module: 'quo' }, crm: { module: 'hubspot' } },
            workflows: [{ id: 'look-up', label: 'Look up', trigger: { type: 'userAction', label: 'Look up' }, steps: [{ id: 'c', use: 'crm.contact.get', with: { id: '$.event.id' } }] }],
        };
        expect(d.validate(def, manifests).errors).toEqual([]);
        const getContactById = jest.fn(async () => ({ id: '51' }));
        const inst = shared([def], { apis: { hubspot: { api: { getContactById } }, quo: { api: {} } } })(pin(def));
        await inst.initialize();
        expect((await inst.send('WF_LOOK_UP', { id: '51' })).status).toBe('completed');
        expect(getContactById).toHaveBeenCalledWith({ id: '51' });
    });
});

describe('webhook resolution (webhooks.js)', () => {
    it('every example delivery in every manifest routes to its own event', () => {
        for (const [name, m] of Object.entries(manifests)) {
            for (const [key, ev] of Object.entries(m.events || {})) {
                if ((ev.delivery || 'webhook') !== 'webhook') continue;
                expect([name, key, eventsIn(m, { body: ev.payload, headers: ev.headers }).some((e) => e.topic === key)]).toEqual([name, key, true]);
            }
        }
    });

    it('a missed Quo call is call.completed with status missed: it is both events; a completed call is only one', () => {
        const missed = eventsIn(manifests.quo, { body: manifests.quo.events['call.missed'].payload }).map((e) => e.topic);
        expect(missed.sort()).toEqual(['call.completed', 'call.missed']);
        expect(eventsIn(manifests.quo, { body: quoCall() }).map((e) => e.topic)).toEqual(['call.completed']);
    });

    it('splits a HubSpot batch into events, each with its own account and event id', () => {
        const body = [
            { eventId: 1, subscriptionType: 'contact.creation', portalId: 111, objectId: '1' },
            { eventId: 2, subscriptionType: 'deal.propertyChange', portalId: 222, objectId: '9' },
            { eventId: 3, subscriptionType: 'company.creation', portalId: 111, objectId: '5' },       // no such event: ignored
        ];
        expect(eventsIn(manifests.hubspot, { body }).map((e) => [e.topic, e.account, e.eventId])).toEqual([['contact.created', '111', '1'], ['deal.propertyChange', '222', '2']]);
    });

    it('a two-level QuickBooks batch takes each entity\'s account from its notification', () => {
        const body = { eventNotifications: [
            { realmId: 'R1', dataChangeEvent: { entities: [{ name: 'Payment', id: '7', operation: 'Create', lastUpdated: 't1' }] } },
            { realmId: 'R2', dataChangeEvent: { entities: [{ name: 'Customer', id: '8', operation: 'Update', lastUpdated: 't2' }, { name: 'Invoice', id: '9', operation: 'Create', lastUpdated: 't3' }] } },
        ] };
        expect(eventsIn(manifests.quickbooks, { body }).map((e) => [e.topic, e.account, e.record.id])).toEqual([['payment.created', 'R1', '7'], ['customer.updated', 'R2', '8']]);
    });

    it('reads a topic from a header, from the first non-empty template, and from a form-encoded body', () => {
        const order = manifests.shopify.events['order.created'];
        expect(eventsIn(manifests.shopify, { body: order.payload, headers: { 'X-Shopify-Topic': 'orders/paid', 'X-Shopify-Webhook-Id': 'w1' } }).map((e) => [e.topic, e.eventId])).toEqual([['order.paid', 'w1']]);
        const interaction = manifests.slack.events['interaction.block_actions'].payload;
        expect(eventsIn(manifests.slack, { body: { payload: JSON.stringify(interaction) } }).map((e) => e.topic)).toEqual(['interaction.block_actions']);
        expect(eventsIn(manifests.slack, { body: manifests.slack.events.app_mention.payload }).map((e) => e.topic)).toEqual(['app_mention']);
    });

    it('handshakes: Slack echoes the challenge, Asana echoes the secret header, anything else is not a handshake', () => {
        expect(handshakeFor(manifests.slack, { body: { type: 'url_verification', challenge: 'c-123' } })).toEqual({ status: 200, headers: {}, body: { challenge: 'c-123' } });
        expect(handshakeFor(manifests.asana, { body: {}, headers: { 'X-Hook-Secret': 's-9' } })).toMatchObject({ status: 200, headers: { 'X-Hook-Secret': 's-9' } });
        expect(handshakeFor(manifests.slack, { body: manifests.slack.events.app_mention.payload })).toBeNull();
    });
});

describe('receipt and worker', () => {
    it('answers a handshake at receipt without queueing anything', async () => {
        const inst = shared([example('hubspot-slack')])();
        const r = res();
        await inst.onWebhookReceived({ req: { body: { type: 'url_verification', challenge: 'abc' }, headers: {}, query: { module: 'slack' }, params: {} }, res: r });
        expect(r.body).toEqual({ challenge: 'abc' });
        expect(inst.queued).toEqual([]);
        const normal = res();
        await inst.onWebhookReceived({ req: { body: { type: 'event_callback' }, headers: {}, query: { module: 'slack' }, params: {} }, res: normal });
        expect(inst.queued).toHaveLength(1);
    });

    it('turns a raw Quo delivery into one message per listening workflow, with the provider event id; a redelivery writes once', async () => {
        const def = example('quo-hubspot');
        const createCallEngagement = jest.fn(async () => ({ id: 'e1' }));
        const inst = shared([def], { apis: { quo: verified(), hubspot: { api: { createCallEngagement } } } })({ ...pin(def), workflows: { 'call-summary': { enabled: false } } });
        await inst.initialize();
        const out = await inst.onWebhook({ data: { integrationId: 'int_1', body: quoCall(), headers: {}, query: { module: 'quo' } } });
        expect(out.routed).toBe(1);
        expect(inst.queued).toEqual([expect.objectContaining({ event: 'WF_LOG_CALL', module: 'quo', topic: 'call.completed', eventId: 'EVc0a1', definitionVersion: '1.4.0' })]);
        inst.rows.set('idx:contacts:phone:+15125550142', { hubspot: '51', quo: 'CT7' });
        const msg = { data: inst.queued[0] };
        expect((await inst.on.WF_LOG_CALL.handler(msg)).status).toBe('completed');
        expect((await inst.on.WF_LOG_CALL.handler(msg)).status).toBe('duplicate');
        expect(createCallEngagement).toHaveBeenCalledTimes(1);
    });

    it('drops a delivery whose signature does not verify, and one whose module has no verify method (fail closed)', async () => {
        const def = example('quo-hubspot');
        const bad = shared([def], { apis: { quo: { api: { verifyWebhookSignature: async () => false } }, hubspot: { api: {} } } })(pin(def));
        await bad.initialize();
        expect(await bad.onWebhook({ data: { body: quoCall(), query: { module: 'quo' } } })).toEqual({ routed: 0, rejected: true });
        const missing = shared([def], { apis: { quo: { api: {} }, hubspot: { api: {} } } })(pin(def));
        await missing.initialize();
        expect((await missing.onWebhook({ data: { body: quoCall(), query: { module: 'quo' } } })).rejected).toBe(true);
        const forgotReturn = shared([def], { apis: { quo: { api: { verifyWebhookSignature: async () => { /* no return */ } } }, hubspot: { api: {} } } })(pin(def));
        await forgotReturn.initialize();
        expect((await forgotReturn.onWebhook({ data: { body: quoCall(), query: { module: 'quo' } } })).rejected).toBe(true);
        expect([...bad.queued, ...missing.queued, ...forgotReturn.queued]).toEqual([]);
    });

    it('dedupes on the provider event id, not on the body\'s id', async () => {
        const def = example('quo-hubspot');
        const createCallEngagement = jest.fn(async () => ({ id: 'e1' }));
        const inst = shared([def], { apis: { quo: verified(), hubspot: { api: { createCallEngagement } } } })(pin(def));
        await inst.initialize();
        inst.rows.set('idx:contacts:phone:+15125550142', { hubspot: '51', quo: 'CT7' });
        const a = { ...quoCall(), id: 'body-1' }, b = { ...quoCall(), id: 'body-2' };
        expect((await inst.on.WF_LOG_CALL.handler({ data: { body: a, eventId: 'delivery-7' } })).status).toBe('completed');
        expect((await inst.on.WF_LOG_CALL.handler({ data: { body: b, eventId: 'delivery-7' } })).status).toBe('duplicate');
        expect(inst.rows.has('evt:quo-hubspot:log-call:delivery-7')).toBe(true);
    });

    it('finds the module without ?module when exactly one manifest recognises the delivery', async () => {
        const def = example('quo-hubspot');
        const inst = shared([def], { apis: { quo: verified(), hubspot: verified() } })(pin(def));
        await inst.initialize();
        expect((await inst.onWebhook({ data: { body: quoCall(), query: {} } })).routed).toBeGreaterThan(0);
    });

    it('an app-level batch is filtered to this installation\'s own account', async () => {
        const def = example('hubspot-slack');
        const inst = shared([def], { apis: { hubspot: verified(), slack: { api: {} } } })(pin(def));
        await inst.initialize();
        const body = [
            { eventId: 10, subscriptionType: 'deal.propertyChange', portalId: 1944396, objectId: '880', propertyName: 'dealstage', propertyValue: 'closedwon' },
            { eventId: 11, subscriptionType: 'deal.propertyChange', portalId: 5555, objectId: '881', propertyName: 'dealstage', propertyValue: 'closedwon' },
        ];
        await inst.onWebhook({ data: { body, query: { module: 'hubspot' } } });
        expect(inst.queued.length).toBeGreaterThan(0);
        expect(inst.queued.every((m) => m.body.portalId === 1944396)).toBe(true);
    });

    it('with no installation, an app-level delivery is queued once per installation connected to each account', async () => {
        const lookup = jest.fn(async (account) => (account === '1944396' ? ['int_a', 'int_b'] : []));
        const dry = shared([example('hubspot-slack')], { lookup })();
        await dry.initialize();
        const body = [{ eventId: 1, subscriptionType: 'deal.creation', portalId: 1944396, objectId: '1' }, { eventId: 2, subscriptionType: 'deal.creation', portalId: 7777, objectId: '2' }];
        expect(await dry.onWebhook({ data: { body, headers: {}, query: { module: 'hubspot' } } })).toEqual({ queued: 2 });
        expect(lookup.mock.calls.map((c) => c.slice(0, 2))).toEqual([['1944396', 'hubspot'], ['7777', 'hubspot']]);
        expect(dry.queued.map((m) => m.integrationId)).toEqual(['int_a', 'int_b']);
        expect(dry.queued[0].body).toBe(body);
        expect(await shared([example('quo-hubspot')], { lookup })().onWebhook({ data: { body: quoCall(), query: { module: 'quo' } } })).toEqual({ queued: 0 });
    });
});

describe('the existing authenticated routes: config options, user actions, UI surfaces', () => {
    const def = example('asana-slack');
    const make = () => shared([def], { apis: { asana: { api: { getWorkspaces: async () => [{ gid: 'w1', name: 'Acme' }], getProjects: async ({ workspaceGid }) => (workspaceGid === 'w1' ? [{ gid: 'p1', name: 'Launch' }] : []) } }, slack: { api: { listChannels: async () => [{ id: 'C1', name: 'general' }], listUsers: async () => [] } } } });

    it('GET config/options: a form whose data is the config shape; a dependent list waits for its input', async () => {
        const inst = make()(pin(def));
        await inst.initialize();
        const form = await inst.getConfigOptions();
        expect(Object.keys(form.data)).toEqual(['settings', 'syncs', 'workflows', 'ui']);
        expect(form.jsonSchema.properties.settings.properties.workspace.oneOf).toEqual([{ const: 'w1', title: 'Acme' }]);
        expect(form.jsonSchema.properties.settings.properties.project.enum).toEqual([]);
        expect(form.uiSchema.settings.project['ui:help']).toMatch(/Choose workspace first/);
        for (const w of def.workflows) expect(form.data.workflows[w.id].enabled).toBe((w.default || 'on') === 'on');
        const requiredInDef = Object.entries(def.settings).filter(([, s]) => s.required && s.default === undefined).map(([k]) => k);
        expect(requiredInDef.length).toBeGreaterThan(0);
        expect(form.jsonSchema.properties.settings.required).toEqual(requiredInDef);
    });

    it('POST config/options/refresh: the values chosen so far fill the dependent list', async () => {
        const inst = make()(pin(def));
        await inst.initialize();
        const form = await inst.refreshConfigOptions({ settings: { workspace: 'w1' } });
        expect(form.jsonSchema.properties.settings.properties.project.oneOf).toEqual([{ const: 'p1', title: 'Launch' }]);
    });

    it('NEEDS_CONFIG comes from the definition\'s required settings, without calling any API', async () => {
        const getWorkspaces = jest.fn();
        const inst = shared([def], { apis: { asana: { api: { getWorkspaces } }, slack: { api: {} } } })(pin(def));
        await inst.initialize();
        expect(await inst.validateConfig()).toBe(true);
        inst.config = { ...inst.config, settings: Object.fromEntries(Object.entries(def.settings).filter(([, s]) => s.required).map(([k]) => [k, 'x'])) };
        for (const w of def.workflows) for (const [k, s] of Object.entries(w.settings || {})) if (s.required && s.default === undefined) ((inst.config.workflows ||= {})[w.id] ||= { settings: {} }).settings[k] = 'x';
        expect(await inst.validateConfig()).toBe(false);
        expect(getWorkspaces).not.toHaveBeenCalled();
    });

    it('POST actions/:id runs a button workflow, renders a UI surface, and the button\'s inputs are its options form', async () => {
        const qh = example('quo-hubspot');
        const sendMessage = jest.fn(async () => ({ id: 'm1' }));
        const inst = shared([qh], { apis: { quo: { api: { sendMessage, listCalls: async () => [], listMessages: async () => [] } }, hubspot: { api: {} } } })({ ...pin(qh), settings: { fromNumber: '+15125550100' } });
        await inst.initialize();
        const opts = await inst.getActionOptions('WF_TEXT_FROM_CARD');
        expect(opts.jsonSchema.properties.input.properties.message).toEqual({ type: 'string', title: 'Message' });
        const run = await inst.send('WF_TEXT_FROM_CARD', { record: { properties: { phone: '+15125550142' } }, input: { message: 'On my way' } });
        expect(run.status).toBe('completed');
        expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ content: 'On my way' }));
        const card = await inst.send('UI_QUO_CARD', { record: { properties: { phone: '+15125550142' } } });
        expect(card.view.component).toBe('Stack');
    });

    it('per-module webhook URLs: an installation URL for installation-scope modules, the app URL for app-scope ones', async () => {
        process.env.FRIGG_PUBLIC_URL = 'https://api.example.com';
        const inst = shared([example('quo-hubspot')])(pin(example('quo-hubspot')), 'int_9');
        await inst.initialize();
        expect(inst.installation().webhookUrls).toEqual({
            quo: 'https://api.example.com/api/data-defined-integration/webhooks/int_9?module=quo',
            hubspot: 'https://api.example.com/api/data-defined-integration/webhooks?module=hubspot',
        });
        delete process.env.FRIGG_PUBLIC_URL;
    });
});

describe('the default app-level lookup', () => {
    it('keeps only installations of this class: one account can be used by integrations of other types too', async () => {
        jest.resetModules();
        jest.doMock('../../../application/commands/integration-commands', () => ({
            createIntegrationCommands: () => ({
                listIntegrationsByEntityExternalId: async (externalId, moduleName) => (externalId === '1944396' && moduleName === 'hubspot' ? ['int_dd', 'int_other', 'int_gone'] : []),
                loadIntegrationContextById: async (id) => ({ int_dd: { context: { record: { config: { type: 'data-defined' } } } }, int_other: { context: { record: { config: { type: 'hubspot-native' } } } } }[id] || { error: 404 }),
            }),
        }));
        const dd = require('..');
        const Cls = dd.defineSharedIntegrationClass({ definitions: dd.memoryDefinitions([example('hubspot-slack')]), manifests, modules: { hubspot: {}, slack: {} }, IntegrationBase: FakeBase });
        const dry = new Cls();
        await dry.initialize();
        const out = await dry.onWebhook({ data: { body: [{ eventId: 1, subscriptionType: 'deal.creation', portalId: 1944396, objectId: '1' }], headers: {}, query: { module: 'hubspot' } } });
        expect(out).toEqual({ queued: 1 });
        expect(dry.queued.map((m) => m.integrationId)).toEqual(['int_dd']);
        jest.dontMock('../../../application/commands/integration-commands');
    });
});
