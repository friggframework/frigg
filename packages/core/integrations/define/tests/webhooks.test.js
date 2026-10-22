/**
 * Contract-2 webhooks (ADR-054 §2): receipt (handshake, verify, receive) with no database, resolve in the worker,
 * then normalize and dispatch to the `on` map with the installation hydrated. SQS is a fake that records messages.
 */
jest.mock('../../../database/config', () => ({ DB_TYPE: 'mongodb', getDatabaseType: jest.fn(() => 'mongodb'), PRISMA_LOG_LEVEL: 'error,warn' }));
jest.mock('../../../queues', () => ({ QueuerUtil: { send: jest.fn(async () => ({})) } }));
jest.mock('../../../application/commands/integration-commands', () => {
    const commands = { listIntegrationsByEntityExternalId: jest.fn(), loadIntegrationContextById: jest.fn() };
    return { createIntegrationCommands: () => commands, __commands: commands };
});

const crypto = require('crypto');
const { QueuerUtil } = require('../../../queues');
const { __commands: commands } = require('../../../application/commands/integration-commands');
const { IntegrationEventDispatcher } = require('../../../handlers/integration-event-dispatcher');
const { defineIntegration, use, planOf } = require('..');
const hubspot = require('./fixtures/hubspot');
const slack = require('./fixtures/slack');

const SECRET = 'shh';
const URL = 'https://hooks.example.com/api/deal-alerts-integration/crm-webhooks/webhooks';

function signedRequest(events, { secret = SECRET, timestamp = Date.now() } = {}) {
    const raw = JSON.stringify(events);
    const sig = crypto.createHmac('sha256', secret).update(`POST${URL}${raw}${timestamp}`).digest('base64');
    return {
        method: 'POST', originalUrl: '/api/deal-alerts-integration/crm-webhooks/webhooks', body: events, rawBody: Buffer.from(raw), query: {}, params: {},
        headers: { host: 'hooks.example.com', 'x-forwarded-proto': 'https', 'x-hubspot-signature-v3': sig, 'x-hubspot-request-timestamp': String(timestamp) },
    };
}
function fakeRes() {
    const res = { statusCode: 200, headers: {} };
    res.status = (c) => { res.statusCode = c; return res; };
    res.set = (k, v) => { res.headers[k] = v; return res; };
    return res;
}
const sent = () => QueuerUtil.send.mock.calls.map(([m]) => m);

const spec = (over = {}) => ({
    name: 'deal-alerts',
    modules: { crm: use(hubspot, { webhooks: { subscribe: ['deal.creation', 'deal.propertyChange:dealstage'], hydrate: ['dealname', 'dealstage'] } }), chat: use(slack) },
    ...over,
});

async function dry(Cls) {
    const i = new Cls();
    await i.initialize();
    return new IntegrationEventDispatcher(i);
}
async function hydrated(Cls, apis = {}, config = {}) {
    const modules = Object.entries(apis).map(([name, api]) => ({ getName: () => name, api }));
    const i = new Cls({ id: 'int-1', userId: 'u1', status: 'ENABLED', config: { type: Cls.Definition.name, ...config }, modules });
    await i.initialize();
    return { i, d: new IntegrationEventDispatcher(i) };
}

beforeEach(() => {
    process.env.DEAL_ALERTS_QUEUE_URL = 'https://sqs.example/deal-alerts';
    process.env.HUBSPOT_CLIENT_SECRET = SECRET;
    QueuerUtil.send.mockClear();
    commands.listIntegrationsByEntityExternalId.mockReset();
    commands.loadIntegrationContextById.mockReset();
});

describe('receipt (no database)', () => {
    it('verifies the v3 signature over the raw body, splits the batch, and queues one RESOLVE per account item', async () => {
        const Cls = defineIntegration(spec());
        const res = fakeRes();
        const events = [{ portalId: 77, objectId: 9, subscriptionType: 'deal.creation' }, { portalId: 78, objectId: 10, subscriptionType: 'deal.creation' }, { objectId: 11 }];
        const out = await (await dry(Cls)).dispatchHttp({ event: 'CRM__WEBHOOKS__RECEIVED', req: signedRequest(events), res });
        expect(res.statusCode).toBe(200);
        expect(out).toEqual({ received: 3, queued: 2 });
        expect(sent()).toEqual([
            { event: 'CRM__WEBHOOKS__RESOLVE', data: { externalId: '77', body: events[0] } },
            { event: 'CRM__WEBHOOKS__RESOLVE', data: { externalId: '78', body: events[1] } },
        ]);
        expect(QueuerUtil.send.mock.calls[0][1]).toBe('https://sqs.example/deal-alerts');
    });

    it('answers 401 and queues nothing when the signature does not verify', async () => {
        const Cls = defineIntegration(spec());
        const res = fakeRes();
        const out = await (await dry(Cls)).dispatchHttp({ event: 'CRM__WEBHOOKS__RECEIVED', req: signedRequest([{ portalId: 1 }], { secret: 'wrong' }), res });
        expect(res.statusCode).toBe(401);
        expect(out).toEqual({ error: 'invalid signature' });
        expect(QueuerUtil.send).not.toHaveBeenCalled();
    });

    it('answers a handshake synchronously, before verification', async () => {
        const chatty = { Definition: { moduleName: 'chatty' }, extensions: { events: { name: 'chatty-events', contract: 2, routes: [{ path: '/events', method: 'POST' }],
            handshake: (input) => (input.body?.type === 'url_verification' ? { status: 200, headers: { 'x-echo': '1' }, body: { challenge: input.body.challenge } } : null),
            verify: () => false, receive: () => [], resolve: { module: 'chatty' }, emits: {} } } };
        const Cls = defineIntegration(spec({ modules: { bot: use(chatty, { events: {} }) } }));
        const res = fakeRes();
        const out = await (await dry(Cls)).dispatchHttp({ event: 'BOT__EVENTS__RECEIVED', req: { method: 'POST', headers: {}, body: { type: 'url_verification', challenge: 'abc' } }, res });
        expect(out).toEqual({ challenge: 'abc' });
        expect(res.headers).toEqual({ 'x-echo': '1' });
    });

    it('a verify named as a string calls that method on a credential-less module Api (the manifest form)', async () => {
        class Api { verifyWebhookSignature(input) { return input.headers['x-ok'] === 'yes'; } }
        const mod = { Definition: { moduleName: 'm', API: Api }, extensions: { hooks: { name: 'm-hooks', contract: 2, routes: [{ path: '/h', method: 'POST' }], verify: 'verifyWebhookSignature',
            receive: (input) => [{ externalId: 'a', body: input.body }], resolve: { module: 'm' }, emits: {} } } };
        const Cls = defineIntegration(spec({ modules: { m: use(mod, { hooks: {} }) } }));
        const ok = fakeRes(), bad = fakeRes();
        await (await dry(Cls)).dispatchHttp({ event: 'M__HOOKS__RECEIVED', req: { method: 'POST', headers: { 'x-ok': 'yes' }, body: {} }, res: ok });
        await (await dry(Cls)).dispatchHttp({ event: 'M__HOOKS__RECEIVED', req: { method: 'POST', headers: {}, body: {} }, res: bad });
        expect([ok.statusCode, bad.statusCode]).toEqual([200, 401]);
    });
});

describe('resolve (worker, dry instance)', () => {
    it('finds the installations of THIS type connected to the account and queues a DISPATCH for each', async () => {
        const Cls = defineIntegration(spec());
        commands.listIntegrationsByEntityExternalId.mockResolvedValue(['int-1', 'int-2', 'int-3']);
        commands.loadIntegrationContextById.mockImplementation(async (id) => ({ context: { record: { config: { type: id === 'int-2' ? 'other-type' : 'deal-alerts' } } } }));
        const body = { portalId: 77, objectId: 9, subscriptionType: 'deal.creation' };
        const out = await (await dry(Cls)).dispatchJob({ event: 'CRM__WEBHOOKS__RESOLVE', data: { externalId: '77', body } });
        expect(commands.listIntegrationsByEntityExternalId).toHaveBeenCalledWith('77', 'hubspot');
        expect(out).toEqual({ resolved: 2 });
        expect(sent()).toEqual([
            { event: 'CRM__WEBHOOKS__DISPATCH', data: { integrationId: 'int-1', body } },
            { event: 'CRM__WEBHOOKS__DISPATCH', data: { integrationId: 'int-3', body } },
        ]);
    });

    it('acks an account with no installation', async () => {
        const Cls = defineIntegration(spec());
        commands.listIntegrationsByEntityExternalId.mockResolvedValue([]);
        expect(await (await dry(Cls)).dispatchJob({ event: 'CRM__WEBHOOKS__RESOLVE', data: { externalId: '1', body: {} } })).toEqual({ resolved: 0 });
        expect(QueuerUtil.send).not.toHaveBeenCalled();
    });
});

describe('dispatch (worker, installation hydrated)', () => {
    it('normalizes with the installation api (hydrate), and runs the on handler with { deal, changes } and ctx', async () => {
        const onDeal = jest.fn();
        const Cls = defineIntegration(spec({ on: { 'crm.deal.changed': onDeal } }));
        const crmApi = { batchReadObjects: jest.fn(async () => ({ results: [{ id: '9', properties: { dealname: 'Big', dealstage: 'closedwon' } }] })) };
        const { d } = await hydrated(Cls, { hubspot: crmApi, slack: {} });
        const body = { portalId: 77, objectId: 9, subscriptionType: 'deal.propertyChange', propertyName: 'dealstage', propertyValue: 'closedwon' };
        const out = await d.dispatchJob({ event: 'CRM__WEBHOOKS__DISPATCH', data: { integrationId: 'int-1', body } });
        expect(out).toEqual({ dispatched: 1, events: 1 });
        expect(crmApi.batchReadObjects).toHaveBeenCalledWith('deals', { inputs: [{ id: '9' }], properties: ['dealname', 'dealstage'] });
        const [payload, ctx] = onDeal.mock.calls[0];
        expect(payload).toEqual({ deal: { id: '9', properties: { dealname: 'Big', dealstage: 'closedwon' } }, changes: { dealstage: { to: 'closedwon' } }, event: body });
        expect(ctx.modules.crm).toBe(crmApi);
    });

    it('acks and counts an emitted event with no handler; logs an undeclared one', async () => {
        const Cls = defineIntegration(spec());
        const { i, d } = await hydrated(Cls, { hubspot: { batchReadObjects: async () => ({ results: [] }) } });
        const event = jest.fn();
        i.telemetry = { event };
        const out = await d.dispatchJob({ event: 'CRM__WEBHOOKS__DISPATCH', data: { body: { portalId: 1, objectId: 2, subscriptionType: 'contact.creation' } } });
        expect(out).toEqual({ dispatched: 0, events: 1 });
        expect(event).toHaveBeenCalledWith('frigg.extension.event_unhandled', { event: 'crm.contact.created' });
        expect(await i.runEmitted(planOf(Cls).extensionBindings[0], 'deal.moved', {})).toBe('undeclared');
    });

    it('resolves function-valued options with the installation config', async () => {
        const normalize = jest.fn(async () => []);
        const mod = { Definition: { moduleName: 'm' }, extensions: { hooks: { name: 'm-hooks', contract: 2, options: { type: 'object', properties: { topics: { type: 'array' } } }, normalize, emits: {} } } };
        const Cls = defineIntegration(spec({ modules: { m: use(mod, { hooks: { topics: (config) => config.topics } }) } }));
        const { d } = await hydrated(Cls, {}, { topics: ['a'] });
        await d.dispatchJob({ event: 'M__HOOKS__DISPATCH', data: { body: {} } });
        expect(normalize.mock.calls[0][1].options).toEqual({ topics: ['a'] });
    });

    it('an extension default handler runs when the integration has none', async () => {
        const handler = jest.fn();
        const mod = { Definition: { moduleName: 'm' }, extensions: { hooks: { name: 'm-hooks', contract: 2, normalize: async () => [{ name: 'ping', payload: 1 }], emits: { ping: { handler } } } } };
        const Cls = defineIntegration(spec({ modules: { m: use(mod, { hooks: {} }) } }));
        const { d } = await hydrated(Cls);
        await d.dispatchJob({ event: 'M__HOOKS__DISPATCH', data: { body: {} } });
        expect(handler).toHaveBeenCalledWith(1, expect.objectContaining({ integration: expect.objectContaining({ id: 'int-1' }) }));
    });
});
