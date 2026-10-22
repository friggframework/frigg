/**
 * defineIntegration (ADR-054 §1, §3, §4): composition, the compile target, namespacing, ctx, config and actions.
 */
jest.mock('../../../database/config', () => ({ DB_TYPE: 'mongodb', getDatabaseType: jest.fn(() => 'mongodb'), PRISMA_LOG_LEVEL: 'error,warn' }));

const { IntegrationBase } = require('../../integration-base');
const { defineIntegration, use, defineExtension, planOf } = require('..');
const { getExtensionRoutes } = require('../../extension');
const { IntegrationEventDispatcher } = require('../../../handlers/integration-event-dispatcher');
const hubspot = require('./fixtures/hubspot');
const slack = require('./fixtures/slack');

const base = (over = {}) => ({
    name: 'deal-alerts',
    version: '1.0.0',
    display: { label: 'Deal alerts' },
    modules: { crm: use(hubspot, { webhooks: { subscribe: ['deal.creation'] } }), chat: use(slack) },
    ...over,
});

/** A hydrated installation, as the queue worker builds it: modules carry their api. */
function installation(Cls, { config = {}, apis = {} } = {}) {
    const modules = Object.entries(apis).map(([name, api]) => ({ getName: () => name, api }));
    return new Cls({ id: 'int-1', userId: 'user-1', status: 'ENABLED', config: { type: Cls.Definition.name, ...config }, modules, entities: [] });
}

describe('defineIntegration: the compile target', () => {
    it('returns an IntegrationBase subclass with a static Definition, like a hand-written class', () => {
        const DealAlerts = defineIntegration(base());
        expect(DealAlerts.prototype).toBeInstanceOf(IntegrationBase);
        expect(DealAlerts.name).toBe('DealAlerts');
        expect(DealAlerts.Definition).toMatchObject({
            name: 'deal-alerts',
            version: '1.0.0',
            display: { label: 'Deal alerts' },
            modules: { crm: { definition: hubspot.Definition }, chat: { definition: slack.Definition } },
        });
        expect(DealAlerts.getName()).toBe('deal-alerts');
        expect(planOf(DealAlerts).bindings.map((b) => b.key)).toEqual(['crm', 'chat']);
        expect(planOf(IntegrationBase)).toBeNull();
    });

    it('accepts the module export alone and the { definition } form as bindings', () => {
        const Cls = defineIntegration(base({ modules: { crm: hubspot, chat: { definition: slack.Definition } } }));
        expect(Cls.Definition.modules).toEqual({ crm: { definition: hubspot.Definition }, chat: { definition: slack.Definition } });
        expect(Cls.Definition.extensions).toBeUndefined();
    });

    it('attaches modules under the author keys, so this.crm / this.chat hydrate as they do today', () => {
        const Cls = defineIntegration(base());
        const crmApi = {}, chatApi = {};
        const i = installation(Cls, { apis: { hubspot: crmApi, slack: chatApi } });
        expect(i.crm.api).toBe(crmApi);
        expect(i.chat.api).toBe(chatApi);
    });
});

describe('namespacing (ADR-054 §3)', () => {
    it('derives the binding key, route, function key and internal event names from the module key', () => {
        const Cls = defineIntegration(base());
        expect(Object.keys(Cls.Definition.extensions)).toEqual(['crm-webhooks']);
        expect(getExtensionRoutes(Cls)).toEqual([
            { bindingName: 'crm-webhooks', extensionName: 'hubspot-webhooks', path: '/webhooks', method: 'POST', event: 'CRM__WEBHOOKS__RECEIVED', useDatabase: false },
        ]);
        expect(Object.keys(Cls.Definition.extensions['crm-webhooks'].extension.events)).toEqual(expect.arrayContaining([
            'CRM__WEBHOOKS__RECEIVED', 'CRM__WEBHOOKS__RESOLVE', 'CRM__WEBHOOKS__DISPATCH', 'CRM__WEBHOOKS__DEAL_CHANGED',
        ]));
    });

    it('binds the same module twice without collisions', async () => {
        const Cls = defineIntegration(base({
            modules: { crmA: use(hubspot, { webhooks: { subscribe: ['deal.creation'] } }), crmB: use(hubspot, { webhooks: { subscribe: ['contact.creation'] } }) },
            on: { 'crmA.deal.changed': jest.fn(), 'crmB.contact.changed': jest.fn() },
        }));
        expect(Object.keys(Cls.Definition.extensions)).toEqual(['crmA-webhooks', 'crmB-webhooks']);
        const i = new Cls();
        await i.initialize();
        expect(i.events.CRM_A__WEBHOOKS__DISPATCH).toBeDefined();
        expect(i.events.CRM_B__WEBHOOKS__DISPATCH).toBeDefined();
    });

    it('rejects an `on` key that no bound extension emits, naming what is available', () => {
        expect(() => defineIntegration(base({ on: { 'crm.deal.moved': () => {} } }))).toThrow(/on\["crm.deal.moved"\]: no bound extension emits it \(bound extensions emit crm.deal.created, crm.deal.changed/);
        expect(() => defineIntegration(base({ on: { 'chat.message': () => {} } }))).toThrow(/no bound extension emits it/);
    });

    it('rejects method-name strings as handlers', () => {
        expect(() => defineIntegration(base({ on: { 'crm.deal.changed': 'onDeal' } }))).toThrow(/handlers are functions/);
    });

    it('rejects unknown spec keys, bad names and unknown extensions when the class is defined', () => {
        expect(() => defineIntegration(base({ events: {} }))).toThrow(/unknown key "events"/);
        expect(() => defineIntegration(base({ name: 'Deal Alerts' }))).toThrow(/lower-kebab-case/);
        expect(() => defineIntegration(base({ modules: { crm: use(hubspot, { pushes: {} }) } }))).toThrow(/hubspot has no extension "pushes"/);
    });

    it('checks use() options against the extension schema (required, unknown, types); function values wait for config', () => {
        expect(() => defineIntegration(base({ modules: { crm: use(hubspot, { webhooks: {} }) } }))).toThrow(/subscribe is required/);
        expect(() => defineIntegration(base({ modules: { crm: use(hubspot, { webhooks: { subscribe: ['x'], hydrat: true } }) } }))).toThrow(/hydrat is not an allowed option/);
        expect(() => defineIntegration(base({ modules: { crm: use(hubspot, { webhooks: { subscribe: 'deal.creation' } }) } }))).toThrow(/subscribe must be array/);
        expect(() => defineIntegration(base({ modules: { crm: use(hubspot, { webhooks: { subscribe: (c) => c.topics } }) } }))).not.toThrow();
    });

    it('checks the extension contract and core range', () => {
        const ext = (over) => ({ Definition: { moduleName: 'm' }, extensions: { x: { name: 'x', contract: 2, ...over } } });
        expect(() => defineIntegration(base({ modules: { m: use(ext({ requires: { core: '>=3' } }), { x: {} }) } }))).toThrow(/requires @friggframework\/core >=3/);
        expect(() => defineIntegration(base({ modules: { m: use(ext({ subscriptions: { scope: 'instance' } }), { x: {} }) } }))).toThrow(/experimental/);
        expect(() => defineIntegration(base({ modules: { m: use(ext({ routes: [{ path: '/w', method: 'POST', event: 'E' }], receive: () => [], resolve: { module: 'm' } }), { x: {} }) } }))).toThrow(/names event "E", which is not in "events"/);
        expect(() => defineExtension({ name: 'y', fields: {} })).toThrow(/config fields are a module export/);
        expect(defineExtension({ name: 'y', emits: { 'a.b': {} } })).toMatchObject({ contract: 2, name: 'y' });
    });

    it('a dual bundle (contract 2 plus its contract-1 face) compiles without its contract-1 events or route events', () => {
        const legacyHandler = jest.fn();
        const dual = { ...hubspot.extensions.webhooks, routes: [{ path: '/webhooks', method: 'POST', event: 'HUBSPOT_WEBHOOK_RECEIVED' }], events: { HUBSPOT_WEBHOOK_RECEIVED: { handler: legacyHandler } } };
        const mod = { ...hubspot, extensions: { webhooks: dual } };
        const Cls = defineIntegration(base({ modules: { crm: use(mod, { webhooks: { subscribe: ['deal.creation'] } }) } }));
        const compiled = Cls.Definition.extensions['crm-webhooks'].extension;
        expect(compiled.routes).toEqual([{ path: '/webhooks', method: 'POST', event: 'CRM__WEBHOOKS__RECEIVED' }]);
        expect(Object.keys(compiled.events)).not.toContain('HUBSPOT_WEBHOOK_RECEIVED');
    });

    it('binds a contract-1 bundle as today under the derived key', () => {
        const legacy = { Definition: { moduleName: 'legacy' }, extensions: { hooks: { name: 'legacy-hooks', routes: [{ path: '/in', method: 'POST', event: 'LEGACY_IN' }], events: { LEGACY_IN: { handler: () => ({ ok: 1 }) } } } } };
        const Cls = defineIntegration(base({ modules: { crm: hubspot, legacy: use(legacy, { hooks: true }) } }));
        expect(Cls.Definition.extensions['legacy-hooks']).toEqual({ extension: legacy.extensions.hooks });
        expect(getExtensionRoutes(Cls)[0]).toMatchObject({ bindingName: 'legacy-hooks', event: 'LEGACY_IN' });
    });
});

describe('ctx (ADR-054 §1)', () => {
    it('has exactly the core-owned keys, with module APIs under ctx.modules by author key, and no `this`', async () => {
        let seen, self;
        const Cls = defineIntegration(base({
            config: { minAmount: { type: 'number', default: 5 } },
            on: { 'crm.deal.changed': function handler(payload, ctx) { seen = ctx; self = this; } },
        }));
        const crmApi = { name: 'crm' }, chatApi = { name: 'chat' };
        const i = installation(Cls, { config: { other: 1 }, apis: { hubspot: crmApi, slack: chatApi } });
        await i.runEmitted(planOf(Cls).extensionBindings[0], 'deal.changed', { deal: {} });
        expect(self).not.toBe(i);
        expect(self).not.toBeInstanceOf(IntegrationBase);
        expect(Object.keys(seen).sort()).toEqual(['commands', 'config', 'integration', 'log', 'modules', 'telemetry']);
        expect(Object.keys(seen.modules)).toEqual(['crm', 'chat']);
        expect(seen.modules.crm).toBe(crmApi);
        expect(seen.modules.chat).toBe(chatApi);
        expect(seen.config).toMatchObject({ minAmount: 5, other: 1 });
        expect(seen.integration).toEqual({ id: 'int-1', name: 'deal-alerts', status: 'ENABLED', userId: 'user-1', entities: [], version: '1.0.0' });
        expect(Object.isFrozen(seen)).toBe(true);
        expect(Object.isFrozen(seen.integration)).toBe(true);
        expect(typeof seen.log.info).toBe('function');
    });

    it('a module key may match a ctx key, because it lives under ctx.modules', async () => {
        let seen;
        const Cls = defineIntegration(base({ modules: { log: use(hubspot, { webhooks: { subscribe: ['deal.creation'] } }) }, on: { 'log.deal.created': (p, ctx) => { seen = ctx; } } }));
        const api = {};
        const i = installation(Cls, { apis: { hubspot: api } });
        await i.runEmitted(planOf(Cls).extensionBindings[0], 'deal.created', {});
        expect(seen.modules.log).toBe(api);
        expect(typeof seen.log.info).toBe('function');
    });

    it('a module key may not name an IntegrationBase member, because modules are attached to the instance too', () => {
        for (const key of ['config', 'events', 'send', 'id', '_secret']) {
            expect(() => defineIntegration(base({ modules: { [key]: hubspot } }))).toThrow(new RegExp(`module key "${key}" names a member of IntegrationBase`));
        }
    });
});

describe('actions', () => {
    it('become USER_ACTION events that run (input, ctx) and are listed by GET_USER_ACTIONS', async () => {
        const run = jest.fn(async (input, ctx) => ({ ok: true, input, channel: ctx.config.channel }));
        const Cls = defineIntegration(base({ actions: { SEND_TEST_ALERT: { title: 'Send a test message', run } } }));
        const i = installation(Cls, { config: { channel: 'C1' } });
        await i.initialize();
        expect(await i.send('GET_USER_ACTIONS')).toMatchObject({ SEND_TEST_ALERT: { type: 'USER_ACTION', userActionType: 'DATA_ACTION', title: 'Send a test message' } });
        await expect(i.send('SEND_TEST_ALERT', { note: 'x' })).resolves.toEqual({ ok: true, input: { note: 'x' }, channel: 'C1' });
    });

    it('rejects lower-case ids and missing titles', () => {
        expect(() => defineIntegration(base({ actions: { sendTest: { title: 't', run() {} } } }))).toThrow(/UPPER_SNAKE_CASE/);
        expect(() => defineIntegration(base({ actions: { SEND: { run() {} } } }))).toThrow(/needs a "title"/);
    });
});

describe('config (ADR-054 §4)', () => {
    const spec = () => base({
        config: {
            channel: slack.fields.channel({ title: 'Post to channel', required: true }),
            stages: hubspot.fields.dealStages({ title: 'Alert when a deal enters', multiple: true, default: ['closedwon'] }),
            minAmount: { type: 'number', title: 'Only deals worth at least', default: 0 },
            note: { type: 'string', title: 'Note', required: true, ui: { 'ui:widget': 'textarea' } },
        },
    });

    it('compiles to getConfigOptions() with field choices loaded through each binding api', async () => {
        const Cls = defineIntegration(spec());
        const crmApi = { getPipelineDetails: jest.fn(async () => ({ results: [{ label: 'Sales', stages: [{ id: 'closedwon', label: 'Won' }, { id: 'appt', label: 'Appointment' }] }] })) };
        const chatApi = { listConversations: jest.fn(async () => ({ channels: [{ id: 'C1', name: 'deals' }] })) };
        const i = installation(Cls, { apis: { hubspot: crmApi, slack: chatApi } });
        const { jsonSchema, uiSchema } = await i.getConfigOptions();
        expect(jsonSchema.required).toEqual(['channel', 'note']);
        expect(jsonSchema.properties.channel).toEqual({ type: 'string', title: 'Post to channel', oneOf: [{ const: 'C1', title: '#deals' }] });
        expect(jsonSchema.properties.stages).toMatchObject({ type: 'array', default: ['closedwon'], uniqueItems: true, items: { type: 'string', oneOf: [{ const: 'closedwon', title: 'Sales: Won' }, { const: 'appt', title: 'Sales: Appointment' }] } });
        expect(jsonSchema.properties.minAmount).toEqual({ type: 'number', title: 'Only deals worth at least', default: 0 });
        expect(uiSchema.note).toEqual({ 'ui:widget': 'textarea' });
        expect(crmApi.getPipelineDetails).toHaveBeenCalledWith('deals');
    });

    it('validateConfig() sees the required fields, so NEEDS_CONFIG works as today', async () => {
        const Cls = defineIntegration(spec());
        const i = installation(Cls, { config: { channel: 'C1' } });
        i.updateIntegrationMessages = { execute: jest.fn() };
        expect(await i.validateConfig()).toBe(true);
        expect(i.updateIntegrationMessages.execute).toHaveBeenCalledWith('int-1', 'warnings', 'Config Validation Error', 'Missing required field of Note', expect.any(Number));
    });

    it('a field whose module is not connected, or whose loader fails, keeps its schema and says why', async () => {
        const Cls = defineIntegration(spec());
        const i = installation(Cls, { apis: { slack: { listConversations: async () => { throw new Error('rate limited'); } } } });
        const { jsonSchema, uiSchema } = await i.getConfigOptions();
        expect(jsonSchema.properties.channel).toEqual({ type: 'string', title: 'Post to channel' });
        expect(uiSchema.channel['ui:help']).toMatch(/could not be loaded/);
        expect(uiSchema.stages['ui:help']).toBe('Connect hubspot to choose.');
    });

    it('handlers see defaults filled in', () => {
        const Cls = defineIntegration(spec());
        expect(installation(Cls, { config: { channel: 'C1' } }).resolvedConfig()).toMatchObject({ channel: 'C1', stages: ['closedwon'], minAmount: 0 });
    });

    it('a field needs its module bound, once or named with `from`', () => {
        expect(() => defineIntegration(base({ modules: { crm: hubspot }, config: { channel: slack.fields.channel() } }))).toThrow(/config.channel is a slack field, but no such module is bound/);
        const twice = { a: use(slack), b: use(slack) };
        expect(() => defineIntegration(base({ modules: twice, config: { channel: slack.fields.channel() } }))).toThrow(/bound as a and b/);
        const Cls = defineIntegration(base({ modules: twice, config: { channel: { ...slack.fields.channel(), from: 'b' } } }));
        expect(planOf(Cls).configPlan.fields.channel.moduleKey).toBe('b');
    });
});

describe('visible', () => {
    it('becomes static visible(context), honoured when listing installable types', async () => {
        const { listIntegrationClasses, resolveIntegrationClass } = require('../../integration-types');
        const Cls = defineIntegration(base({ visible: (context) => context?.userId === 'u1' }));
        const Other = defineIntegration(base({ name: 'other' }));
        expect((await listIntegrationClasses([Cls, Other], { userId: 'u1' })).map((c) => c.Definition.name)).toEqual(['deal-alerts', 'other']);
        expect((await listIntegrationClasses([Cls, Other], { userId: 'u2' })).map((c) => c.Definition.name)).toEqual(['other']);
        // Hydrating an installation that exists (no context) always resolves.
        expect(await resolveIntegrationClass([Cls], 'deal-alerts')).toBe(Cls);
        expect(await resolveIntegrationClass([Cls], 'deal-alerts', { userId: 'u2' })).toBeNull();
    });
});

describe('dispatch through the existing event dispatcher', () => {
    it('the emitted queue event runs the on handler (replays use it)', async () => {
        const handler = jest.fn();
        const Cls = defineIntegration(base({ on: { 'crm.deal.changed': handler } }));
        const i = installation(Cls);
        await i.initialize();
        await new IntegrationEventDispatcher(i).dispatchJob({ event: 'CRM__WEBHOOKS__DEAL_CHANGED', data: { integrationId: 'int-1', payload: { deal: { id: '9' } } } });
        expect(handler).toHaveBeenCalledWith({ deal: { id: '9' } }, expect.objectContaining({ modules: expect.any(Object) }));
    });
});
