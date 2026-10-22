/**
 * App-scope subscriptions reconcile (ADR-054 §2) and defineApp.
 */
jest.mock('../../../database/config', () => ({ DB_TYPE: 'mongodb', getDatabaseType: jest.fn(() => 'mongodb'), PRISMA_LOG_LEVEL: 'error,warn' }));

const nock = require('nock');
const { defineIntegration, defineApp, use, reconcileAppSubscriptions } = require('..');
const hubspot = require('./fixtures/hubspot');
const slack = require('./fixtures/slack');

const alerts = (over = {}) => defineIntegration({ name: 'deal-alerts', modules: { crm: use(hubspot, { webhooks: { subscribe: ['deal.creation', 'deal.propertyChange:dealstage'] } }), chat: use(slack) }, ...over });

beforeAll(() => nock.disableNetConnect());
afterEach(() => nock.cleanAll());
afterAll(() => nock.enableNetConnect());

describe('reconcileAppSubscriptions', () => {
    beforeEach(() => { process.env.HUBSPOT_APP_ID = '42'; });

    it('creates what the union of bindings needs and removes what none needs, against the provider API', async () => {
        const contacts = defineIntegration({ name: 'contact-sync', modules: { crm: use(hubspot, { webhooks: { subscribe: (config) => config.topics } }) } });
        const installations = { 'contact-sync': [{ id: 1, config: { topics: ['contact.creation'] } }, { id: 2, config: { topics: ['contact.propertyChange:email'] } }] };
        const api = nock('https://api.hubapi.com')
            .get('/webhooks/v3/42/subscriptions').reply(200, { results: [
                { id: 's1', eventType: 'deal.creation' },
                { id: 's2', eventType: 'company.deletion' },
            ] })
            .post('/webhooks/v3/42/subscriptions', { eventType: 'deal.propertyChange', propertyName: 'dealstage', active: true }).reply(201, { id: 's3' })
            .post('/webhooks/v3/42/subscriptions', { eventType: 'contact.creation', active: true }).reply(201, { id: 's4' })
            .post('/webhooks/v3/42/subscriptions', { eventType: 'contact.propertyChange', propertyName: 'email', active: true }).reply(201, { id: 's5' })
            .delete('/webhooks/v3/42/subscriptions/s2').reply(204);
        const [result] = await reconcileAppSubscriptions({
            integrations: [alerts(), contacts],
            listInstallations: async function* list(Cls) { yield* installations[Cls.Definition.name] || []; },
        });
        expect(result).toEqual({
            extension: 'hubspot-webhooks', module: 'hubspot',
            desired: ['deal.creation', 'deal.propertyChange:dealstage', 'contact.creation', 'contact.propertyChange:email'],
            create: ['deal.propertyChange:dealstage', 'contact.creation', 'contact.propertyChange:email'],
            remove: ['company.deletion'],
            kept: ['deal.creation'],
        });
        expect(api.isDone()).toBe(true);
    });

    it('plans without calling create or remove on a dry run, and skips classes without app-scope extensions', async () => {
        nock('https://api.hubapi.com').get('/webhooks/v3/42/subscriptions').reply(200, { results: [] });
        const plain = defineIntegration({ name: 'plain', modules: { chat: slack } });
        const [result] = await reconcileAppSubscriptions({ integrations: [alerts(), plain], dryRun: true });
        expect(result.create).toEqual(['deal.creation', 'deal.propertyChange:dealstage']);
        expect(nock.pendingMocks()).toEqual([]);
    });
});

describe('defineApp', () => {
    it('returns { Definition } as backend/index.js exports it today', () => {
        const DealAlerts = alerts();
        const app = defineApp({ name: 'deal-alerts', integrations: [DealAlerts], database: { postgres: { enable: true } } }, { schemas: null });
        expect(app).toEqual({ Definition: { name: 'deal-alerts', integrations: [DealAlerts], database: { postgres: { enable: true } } } });
    });

    it('rejects non-classes, missing integrations and duplicate names', () => {
        expect(() => defineApp({ name: 'a', integrations: [] }, { schemas: null })).toThrow(/at least one integration/);
        expect(() => defineApp({ name: 'a', integrations: [{ Definition: { name: 'x' } }] }, { schemas: null })).toThrow(/integrations\[0\] is not an integration class/);
        expect(() => defineApp({ name: 'a', integrations: [alerts(), alerts()] }, { schemas: null })).toThrow(/two integrations are named "deal-alerts"/);
    });

    it('validates a summary of the app definition with @friggframework/schemas when it is installed', () => {
        const validateAppDefinition = jest.fn((d) => (d.vpc?.enable === 'yes' ? { valid: false, errors: [{ instancePath: '/vpc/enable', message: 'must be boolean' }] } : { valid: true }));
        const DealAlerts = alerts();
        defineApp({ name: 'a', integrations: [DealAlerts], database: { postgres: { enable: true } } }, { schemas: { validateAppDefinition } });
        expect(validateAppDefinition).toHaveBeenCalledWith({ name: 'a', integrations: [{ name: 'deal-alerts' }], database: { postgres: { enable: true } } });
        expect(() => defineApp({ name: 'a', integrations: [DealAlerts], vpc: { enable: 'yes' } }, { schemas: { validateAppDefinition } }))
            .toThrow('defineApp("a"): the app definition does not match app-definition.schema.json: /vpc/enable must be boolean');
    });

    let realSchemas = null;
    try { realSchemas = require('../../../../schemas'); } catch { /* not installed in this checkout */ }
    (realSchemas ? it : it.skip)('the ADR-054 sample app definition passes the real app-definition.schema.json', () => {
        expect(() => defineApp({ name: 'deal-alerts', integrations: [alerts()], database: { postgres: { enable: true } }, encryption: { fieldLevelEncryptionMethod: 'kms' } }, { schemas: realSchemas })).not.toThrow();
    });
});
