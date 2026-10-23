/**
 * Example (a) of ADR-054 Appendix A, loaded as an app and run end to end:
 *
 *   signed HubSpot POST -> the extension route on a real express app (rawBody kept as in production)
 *   -> RESOLVE (worker, dry: portalId -> installations) -> DISPATCH (worker, hydrated: hydrate the deal)
 *   -> on['crm.deal.changed'] -> owner lookup in HubSpot, user lookup and chat.postMessage in Slack.
 *
 * HubSpot and Slack are nock'd; the modules are the test stand-ins in fixtures/ (the real contract-2 HubSpot
 * extension is in api-module-library). SQS is a fake that records messages, and the worker hop is replayed by
 * hand with IntegrationEventDispatcher, as the queue worker does after it hydrates the installation.
 */
jest.mock('../../../database/config', () => ({ DB_TYPE: 'mongodb', getDatabaseType: jest.fn(() => 'mongodb'), PRISMA_LOG_LEVEL: 'error,warn' }));
jest.mock('../../../queues', () => ({ QueuerUtil: { send: jest.fn(async () => ({})) } }));
jest.mock('../../../application/commands/integration-commands', () => {
    const commands = { listIntegrationsByEntityExternalId: jest.fn(), loadIntegrationContextById: jest.fn() };
    return { createIntegrationCommands: () => commands, __commands: commands };
});
jest.mock('@friggframework/core', () => jest.requireActual('../index'));
jest.mock('@friggframework/api-module-hubspot', () => jest.requireActual('./fixtures/hubspot'), { virtual: true });
jest.mock('@friggframework/api-module-slack', () => jest.requireActual('./fixtures/slack'), { virtual: true });

const crypto = require('crypto');
const nock = require('nock');
const fetch = require('node-fetch');
const express = require('express');
const bodyParser = require('body-parser');
const { QueuerUtil } = require('../../../queues');
const { __commands: commands } = require('../../../application/commands/integration-commands');
const { IntegrationEventDispatcher } = require('../../../handlers/integration-event-dispatcher');
const { loadRouterFromObject } = require('../../../handlers/backend-utils');
const { getExtensionRoutes } = require('../../extension');
const hubspot = require('@friggframework/api-module-hubspot');
const slack = require('@friggframework/api-module-slack');

const app = require('../examples/deal-alerts');
const [DealAlerts] = app.Definition.integrations;

const SECRET = 'hubspot-client-secret';
const CONFIG = { channel: 'C123', stages: ['closedwon'], minAmount: 1000, mentionOwner: true };

/** The app's extension routes on an express app that keeps the raw body, as app-handler-helpers does in production. */
async function startServer() {
    const server = express();
    const keepRaw = (req, res, buf) => { req.rawBody = buf; };
    server.use(bodyParser.json({ verify: keepRaw }));
    for (const route of getExtensionRoutes(DealAlerts)) {
        server.use(`/api/${DealAlerts.Definition.name}-integration/${route.bindingName}`, loadRouterFromObject(DealAlerts, route));
    }
    return new Promise((resolve) => { const s = server.listen(0, '127.0.0.1', () => resolve(s)); });
}

async function postSigned(base, path, events, secret = SECRET) {
    const raw = JSON.stringify(events);
    const timestamp = String(Date.now());
    const url = `${base}${path}`;
    const signature = crypto.createHmac('sha256', secret).update(`POST${url}${raw}${timestamp}`).digest('base64');
    return fetch(url, { method: 'POST', body: raw, headers: { 'content-type': 'application/json', 'x-hubspot-signature-v3': signature, 'x-hubspot-request-timestamp': timestamp } });
}

/** The installation as the queue worker hydrates it: the record plus each module with an authenticated Api. */
function installation(config = CONFIG) {
    return new DealAlerts({
        id: 'int-1', userId: 'user-1', status: 'ENABLED', config: { type: 'deal-alerts', ...config },
        modules: [
            { getName: () => 'hubspot', api: new hubspot.Api({ access_token: 'hs-token' }) },
            { getName: () => 'slack', api: new slack.Api({ access_token: 'xoxb-token' }) },
        ],
    });
}

/** Replay each queued message the way the queue worker would, returning what it queued next. */
async function work(messages, instanceFor) {
    const next = [];
    for (const m of messages) {
        QueuerUtil.send.mockClear();
        const instance = instanceFor(m);
        await instance.initialize();
        await new IntegrationEventDispatcher(instance).dispatchJob({ event: m.event, data: m.data });
        next.push(...QueuerUtil.send.mock.calls.map(([msg]) => msg));
    }
    return next;
}

let server, base;
beforeAll(async () => {
    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1');
    server = await startServer();
    base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => { await new Promise((r) => server.close(r)); nock.enableNetConnect(); });
beforeEach(() => {
    process.env.DEAL_ALERTS_QUEUE_URL = 'https://sqs.example/deal-alerts';
    process.env.HUBSPOT_CLIENT_SECRET = SECRET;
    QueuerUtil.send.mockClear();
    commands.listIntegrationsByEntityExternalId.mockResolvedValue(['int-1']);
    commands.loadIntegrationContextById.mockResolvedValue({ context: { record: { config: { type: 'deal-alerts' } } } });
});
afterEach(() => nock.cleanAll());

describe('example (a): HubSpot deal reaches a stage -> Slack post', () => {
    it('the app definition is what defineApp returns, with the derived extension binding', () => {
        expect(app.Definition).toMatchObject({ name: 'deal-alerts', database: { postgres: { enable: true } }, encryption: { fieldLevelEncryptionMethod: 'kms' } });
        expect(Object.keys(DealAlerts.Definition.extensions)).toEqual(['crm-webhooks']);
        expect(getExtensionRoutes(DealAlerts).map((r) => `${r.method} /${r.bindingName}${r.path}`)).toEqual(['POST /crm-webhooks/webhooks']);
    });

    it('runs from the signed webhook to the Slack message', async () => {
        const event = { eventId: 1, portalId: 77, objectId: 9, subscriptionType: 'deal.propertyChange', propertyName: 'dealstage', propertyValue: 'closedwon', occurredAt: 1 };

        // 1. Receipt: verify, split, queue RESOLVE. No database, no HubSpot call.
        const res = await postSigned(base, '/api/deal-alerts-integration/crm-webhooks/webhooks', [event]);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ received: 1, queued: 1 });
        const resolveMessages = QueuerUtil.send.mock.calls.map(([m]) => m);
        expect(resolveMessages).toEqual([{ event: 'CRM__WEBHOOKS__RESOLVE', data: { externalId: '77', body: event } }]);

        // 2. Worker, dry: portalId 77 -> the deal-alerts installations connected to that portal.
        const dispatchMessages = await work(resolveMessages, () => new DealAlerts());
        expect(commands.listIntegrationsByEntityExternalId).toHaveBeenCalledWith('77', 'hubspot');
        expect(dispatchMessages).toEqual([{ event: 'CRM__WEBHOOKS__DISPATCH', data: { integrationId: 'int-1', body: event } }]);

        // 3. Worker, hydrated: hydrate the deal, run the handler, which calls HubSpot and Slack.
        const hs = nock('https://api.hubapi.com', { reqheaders: { authorization: 'Bearer hs-token' } })
            .post('/crm/v3/objects/deals/batch/read', { inputs: [{ id: '9' }], properties: ['dealname', 'amount', 'dealstage', 'pipeline', 'hubspot_owner_id'] })
            .reply(200, { results: [{ id: '9', properties: { dealname: 'Big Deal', amount: '25000', dealstage: 'closedwon', pipeline: 'default', hubspot_owner_id: '7' } }] })
            .get('/crm/v3/owners/7').reply(200, { id: '7', email: 'owner@example.com' });
        let posted;
        const sl = nock('https://slack.com', { reqheaders: { authorization: 'Bearer xoxb-token' } })
            .get('/api/users.lookupByEmail').query({ email: 'owner@example.com' }).reply(200, { ok: true, user: { id: 'U42' } })
            .post('/api/chat.postMessage', (body) => { posted = body; return true; }).reply(200, { ok: true, ts: '1.2' });
        const after = await work(dispatchMessages, () => installation());
        expect(after).toEqual([]);
        expect(hs.isDone()).toBe(true);
        expect(sl.isDone()).toBe(true);
        expect(posted).toMatchObject({ channel: 'C123', text: 'Deal *Big Deal* moved to closedwon <@U42>' });
        expect(posted.blocks[0].text.text).toBe('*Big Deal*  closedwon\nAmount: 25000 <@U42>');
        expect(posted.blocks[1].elements[0].url).toBe('https://app.hubspot.com/contacts/77/record/0-3/9');
    });

    it('rejects a forged webhook at receipt and queues nothing', async () => {
        const res = await postSigned(base, '/api/deal-alerts-integration/crm-webhooks/webhooks', [{ portalId: 77 }], 'not-the-secret');
        expect(res.status).toBe(401);
        expect(QueuerUtil.send).not.toHaveBeenCalled();
    });

    it('a deal outside the chosen stages or under the amount posts nothing', async () => {
        nock('https://api.hubapi.com').post('/crm/v3/objects/deals/batch/read').reply(200, { results: [{ id: '9', properties: { dealname: 'Small', amount: '10', dealstage: 'closedwon' } }] });
        const body = { portalId: 77, objectId: 9, subscriptionType: 'deal.propertyChange', propertyName: 'dealstage', propertyValue: 'closedwon' };
        await work([{ event: 'CRM__WEBHOOKS__DISPATCH', data: { integrationId: 'int-1', body } }], () => installation());
        nock('https://api.hubapi.com').post('/crm/v3/objects/deals/batch/read').reply(200, { results: [{ id: '9', properties: { dealname: 'Big', amount: '99999', dealstage: 'appointmentscheduled' } }] });
        await work([{ event: 'CRM__WEBHOOKS__DISPATCH', data: { integrationId: 'int-1', body: { ...body, propertyValue: 'appointmentscheduled' } } }], () => installation());
        expect(nock.pendingMocks()).toEqual([]);   // no Slack call was set up, and none was attempted (disableNetConnect)
    });

    it('the config form loads Slack channels and HubSpot stages from the connected accounts', async () => {
        nock('https://slack.com').get('/api/conversations.list').query(true).reply(200, { ok: true, channels: [{ id: 'C123', name: 'deals' }] });
        nock('https://api.hubapi.com').get('/crm/v3/pipelines/deals').reply(200, { results: [{ label: 'Sales', stages: [{ id: 'closedwon', label: 'Closed won' }] }] });
        const inst = installation({});
        await inst.initialize();
        const { jsonSchema } = await inst.send('GET_CONFIG_OPTIONS');
        expect(jsonSchema.required).toEqual(['channel']);
        expect(jsonSchema.properties.channel.oneOf).toEqual([{ const: 'C123', title: '#deals' }]);
        expect(jsonSchema.properties.stages.items.oneOf).toEqual([{ const: 'closedwon', title: 'Sales: Closed won' }]);
        expect(jsonSchema.properties.stages.default).toEqual(['closedwon']);
    });

    it('the SEND_TEST_ALERT action posts to the configured channel', async () => {
        let posted;
        nock('https://slack.com').post('/api/chat.postMessage', (b) => { posted = b; return true; }).reply(200, { ok: true });
        const inst = installation();
        await inst.initialize();
        expect(await inst.send('SEND_TEST_ALERT', {})).toEqual({ ok: true });
        expect(posted).toEqual({ channel: 'C123', text: 'Deal alerts are connected.' });
    });
});
