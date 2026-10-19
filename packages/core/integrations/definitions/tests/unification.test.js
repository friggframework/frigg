/**
 * Published definitions are integration types like any other: each resolves to a class of its own, named by its id,
 * listed beside code integrations, installed by { type }, and answered for by the same routes. Only the deployment
 * underneath (queue, functions, the app-level webhook URL) is shared.
 */
jest.mock('../../../database/config', () => ({ DB_TYPE: 'mongodb', getDatabaseType: jest.fn(() => 'mongodb'), PRISMA_LOG_LEVEL: 'error,warn' }));

const express = require('express');
const request = require('supertest');
const d = require('..');
const { setIntegrationRuntimeRoutes } = require('../router');
const { resolveIntegrationClass, listIntegrationClasses } = require('../../integration-types');
const { GetPossibleIntegrations } = require('../../use-cases/get-possible-integrations');
const { IntegrationBase } = require('../../integration-base');

const manifests = d.loadManifests();
const example = (id) => JSON.parse(JSON.stringify(d.loadExamples().find((x) => x.id === id)));

class FakeBase {
    constructor(p = {}) { this.events = {}; this.config = p.config; this.id = p.id; this.rows = new Map(); this.queue = []; this.patches = []; }
    async initialize() { this.registerEventHandlers(); }
    registerEventHandlers() {}
    async patchConfig(c) { this.patches.push(c); this.config = { ...this.config, ...c }; }
    async onCreate() {}
    async getMapping(k) { return this.rows.has(k) ? { mapping: this.rows.get(k) } : null; }
    async upsertMapping(k, v) { this.rows.set(k, v); }
    async createMapping(k, v) { this.rows.set(k, v); }
    async deleteMapping(k) { this.rows.delete(k); }
    async queueWebhook(m) { this.queue.push(m); }
    static getDeploymentName() { return (this.Host || this).Definition.name; }
}

/** A code integration, as an app registers one. */
class HubspotSlack extends FakeBase {
    static Definition = { name: 'hubspot-slack-code', version: '3.0.0', modules: { hubspot: { definition: { getName: () => 'hubspot' } } }, display: { label: 'Code one' } };
    static getOptionDetails() { return { type: 'hubspot-slack-code', display: { name: 'Code one' } }; }
}

function host(docs = [example('quo-hubspot')], Base = FakeBase) {
    return d.defineSharedIntegrationClass({ definitions: d.memoryDefinitions(docs), manifests, modules: { quo: { getName: () => 'quo' }, hubspot: { getName: () => 'hubspot' } }, IntegrationBase: Base, runs: false });
}

describe('integration types', () => {
    it('a published definition resolves to its own class: its name, its label, the host underneath', async () => {
        const Host = host();
        const Cls = await resolveIntegrationClass([HubspotSlack, Host], 'quo-hubspot');
        expect(Cls.Definition).toMatchObject({ name: 'quo-hubspot', version: '1.4.0', display: { label: 'Quo ↔ HubSpot', category: 'CRM' } });
        expect(Object.keys(Cls.Definition.modules)).toEqual(['quo', 'hubspot']);
        expect(Cls.Host).toBe(Host);
        expect(Cls.getDeploymentName()).toBe('integration-runtime');
        expect(Cls.IntegrationProvider).toBeUndefined();
        expect(await resolveIntegrationClass([HubspotSlack, Host], 'quo-hubspot')).toBe(Cls);   // one class per type
        expect(await resolveIntegrationClass([HubspotSlack, Host], 'hubspot-slack-code')).toBe(HubspotSlack);
        expect(await resolveIntegrationClass([HubspotSlack, Host], 'nothing-by-this-name')).toBeNull();
        expect(await resolveIntegrationClass([HubspotSlack, Host], 'integration-runtime')).toBe(Host);
    });

    it('code wins: a definition with a registered name never shadows the class', async () => {
        const doc = { ...example('quo-hubspot'), id: 'hubspot-slack-code' };
        expect(await resolveIntegrationClass([HubspotSlack, host([doc])], 'hubspot-slack-code')).toBe(HubspotSlack);
        expect((await listIntegrationClasses([HubspotSlack, host([doc])])).map((c) => c.Definition.name)).toEqual(['hubspot-slack-code']);
    });

    it('a definition needing an app module this deployment lacks is not installable here', async () => {
        const Host = host([example('quo-hubspot'), example('shopify-netsuite')]);
        expect(await resolveIntegrationClass([Host], 'shopify-netsuite')).toBeNull();
        expect((await listIntegrationClasses([Host])).map((c) => c.Definition.name)).toEqual(['quo-hubspot']);
    });

    it('GET /api/integrations options list code and published types the same way; the host itself is not one', async () => {
        const options = await new GetPossibleIntegrations({ integrationClasses: [HubspotSlack, host()] }).execute();
        expect(options).toEqual([
            { type: 'hubspot-slack-code', display: { name: 'Code one' } },
            { type: 'quo-hubspot', hasUserConfig: true, isMany: false, requiresNewEntity: false, display: { name: 'Quo ↔ HubSpot', description: expect.any(String), detailsUrl: undefined, icon: undefined } },
        ]);
    });
});

describe('installing by type', () => {
    it('{ type } pins the latest version at install, and keeps it when a newer one is published', async () => {
        const v1 = example('quo-hubspot');
        const docs = [v1];
        const Host = host(docs);
        const Cls = await resolveIntegrationClass([Host], 'quo-hubspot');
        const inst = new Cls({ id: 'int9', config: { type: 'quo-hubspot', settings: { fromNumber: '+15125550100' } } });
        inst.quo = { api: { createUnifiedWebhook: async () => ({ id: 'W1' }) } };
        inst.hubspot = { api: {}, entity: { externalId: '1' } };
        await inst.initialize();
        await inst.onCreate({});
        expect(inst.patches[0].definition).toEqual({ id: 'quo-hubspot', version: '1.4.0', checksum: expect.any(String) });

        docs.push({ ...JSON.parse(JSON.stringify(v1)), version: '1.5.0' });
        const later = new Cls({ id: 'int9', config: inst.config });
        await later.initialize();
        expect(later.def.version).toBe('1.4.0');
    });

    it('refuses an installation whose pin names another definition than its type', async () => {
        const Cls = await resolveIntegrationClass([host([example('quo-hubspot'), example('github-linear')])], 'quo-hubspot');
        await expect(new Cls({ id: 'x', config: { type: 'quo-hubspot', definition: { id: 'github-linear', version: '1.0.0' } } }).initialize()).rejects.toThrow('type is "quo-hubspot"');
    });

    it('webhooks: its own URL for its own webhooks; the shared URL for app-level ones', async () => {
        const Cls = await resolveIntegrationClass([host()], 'quo-hubspot');
        const inst = new Cls({ id: 'int9', config: { type: 'quo-hubspot', definition: { id: 'quo-hubspot', version: '1.4.0' } } });
        await inst.initialize();
        const { webhookUrl, webhookUrls } = inst.installation();
        expect(webhookUrl).toBe('/api/quo-hubspot-integration/webhooks/int9');
        expect(webhookUrls.quo).toBe('/api/quo-hubspot-integration/webhooks/int9?module=quo');
        expect(webhookUrls.hubspot).toBe('/api/integration-runtime-integration/webhooks?module=hubspot');   // HubSpot posts every account to one URL
    });
});

describe('on the shared deployment', () => {
    const OLD = { ...process.env };
    afterEach(() => { process.env = { ...OLD }; });

    it('queues and schedules on the host queue, while reporting its own name', async () => {
        process.env.INTEGRATION_RUNTIME_QUEUE_URL = 'https://sqs/host-queue';
        const Host = host([example('quo-hubspot')], IntegrationBase);
        const Cls = await resolveIntegrationClass([Host], 'quo-hubspot');
        expect(Cls.getDeploymentName()).toBe('integration-runtime');
        expect(IntegrationBase.getDeploymentName.call(HubspotSlack)).toBe('hubspot-slack-code');
        const inst = new Cls({ id: 'int9', config: { type: 'quo-hubspot', definition: { id: 'quo-hubspot', version: '1.4.0' } } });
        expect(inst.scheduleQueueUrl()).toBe('https://sqs/host-queue');
        expect(inst.getTelemetryContext().integrationType).toBe('quo-hubspot');
        const { QueuerUtil } = require('../../../queues');
        const send = jest.spyOn(QueuerUtil, 'send').mockResolvedValue('m1');
        await inst.queueWebhook({ event: 'ON_WEBHOOK', integrationId: 'int9' });
        expect(send).toHaveBeenCalledWith(expect.objectContaining({ event: 'ON_WEBHOOK' }), 'https://sqs/host-queue');
        send.mockRestore();
    });

    it('app-level webhooks fan out to installations of every type the host provides, and no others', async () => {
        const lookups = [];
        const Host = d.defineSharedIntegrationClass({
            definitions: d.memoryDefinitions([example('quo-hubspot')]), manifests, modules: { quo: {}, hubspot: {} }, IntegrationBase: FakeBase, runs: false,
            lookup: async (account, moduleName) => { lookups.push([account, moduleName]); return ['a1']; },
        });
        const dry = new Host();
        await dry.initialize();
        const out = await dry.onWebhook({ data: { body: [{ portalId: 1944396, objectId: 5, subscriptionType: 'contact.creation', eventId: 1 }], headers: {}, query: { module: 'hubspot' } } });
        expect(out).toEqual({ queued: 1 });
        expect(lookups).toEqual([['1944396', 'hubspot']]);
        // A dry instance of a published type (no installation yet) fans out too, rather than routing as if installed.
        const Cls = await resolveIntegrationClass([Host], 'quo-hubspot');
        const dryTyped = new Cls();
        await dryTyped.initialize();
        expect(await dryTyped.onWebhook({ data: { body: [{ portalId: 1944396, objectId: 5, subscriptionType: 'contact.creation', eventId: 1 }], headers: {}, query: { module: 'hubspot' } } })).toEqual({ queued: 1 });
    });
});

describe('the same routes for every integration', () => {
    function app(inst) {
        const a = express();
        a.use(express.json());
        const authenticateUser = { execute: async () => ({ getId: () => 'u1' }) };
        const getIntegrationInstance = { integrationRepository: { findIntegrationById: async (id) => ({ id, userId: 'u1' }) }, execute: async () => inst };
        setIntegrationRuntimeRoutes(a, authenticateUser, { getIntegrationInstance, integrationClasses: [HubspotSlack, host()] });
        a.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message })); // eslint-disable-line no-unused-vars
        return a;
    }

    it('a code integration answers runs, syncs, upgrade and decision with what it has, never "not a definition"', async () => {
        const code = new HubspotSlack({ id: 'c1', config: { type: 'hubspot-slack-code' } });
        expect((await request(app(code)).get('/api/integrations/c1/runs')).body).toEqual({ runs: [] });
        expect((await request(app(code)).get('/api/integrations/c1/syncs')).body).toEqual({ syncs: [] });
        const plan = await request(app(code)).get('/api/integrations/c1/upgrade');
        expect(plan.status).toBe(200);
        expect(plan.body).toMatchObject({ allowed: false, from: '3.0.0', to: '3.0.0' });
        expect((await request(app(code)).post('/api/integrations/c1/upgrade').send({})).status).toBe(409);
        const decision = await request(app(code)).post('/api/integrations/c1/runs/r1/decision').send({ decision: 'approve' });
        expect(decision.status).toBe(404);
        expect(decision.body.code).toBe('NOT_WAITING');
    });

    it('publishing answers at /api/admin/integrations/versions, and nowhere else', async () => {
        process.env.ADMIN_API_KEY = 'admin-key';
        const a = app(new HubspotSlack({ id: 'c1' }));
        const r = await request(a).post('/api/admin/integrations/versions').set('x-frigg-admin-api-key', 'admin-key').send({ document: example('quo-hubspot') });
        expect(r.status).toBe(501);                             // bundled definitions: the route exists, there is no store
        expect(r.body.code).toBe('NO_STORE');
        expect((await request(a).post('/api/admin/integration-definitions').set('x-frigg-admin-api-key', 'admin-key').send({})).status).toBe(404);
    });
});
