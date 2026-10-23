/**
 * App-scope subscriptions reconcile (ADR-054 §2) and defineApp.
 */
jest.mock('../../../database/config', () => ({ DB_TYPE: 'mongodb', getDatabaseType: jest.fn(() => 'mongodb'), PRISMA_LOG_LEVEL: 'error,warn' }));

const nock = require('nock');
const { defineIntegration, defineApp, use, reconcileAppSubscriptions, createReconcileSubscriptionsScript } = require('..');
const hubspot = require('./fixtures/hubspot');
const slack = require('./fixtures/slack');

const alerts = (over = {}) => defineIntegration({ name: 'deal-alerts', modules: { crm: use(hubspot, { webhooks: { subscribe: ['deal.creation', 'deal.propertyChange:dealstage'] } }), chat: use(slack) }, ...over });

beforeAll(() => nock.disableNetConnect());
afterEach(() => nock.cleanAll());
afterAll(() => nock.enableNetConnect());

describe('reconcileAppSubscriptions', () => {
    beforeEach(() => { process.env.HUBSPOT_APP_ID = '42'; });

    const contacts = () => defineIntegration({ name: 'contact-sync', modules: { crm: use(hubspot, { webhooks: { subscribe: (config) => config.topics } }) } });
    const installations = { 'contact-sync': [{ id: 1, config: { topics: ['contact.creation'] } }, { id: 2, config: { topics: ['contact.propertyChange:email'] } }] };
    const listInstallations = async function* list(Cls) { yield* installations[Cls.Definition.name] || []; };
    const provider = () => nock('https://api.hubapi.com')
        .get('/webhooks/v3/42/subscriptions').reply(200, { results: [{ id: 's1', eventType: 'deal.creation' }, { id: 's2', eventType: 'company.deletion' }] })
        .post('/webhooks/v3/42/subscriptions', { eventType: 'deal.propertyChange', propertyName: 'dealstage', active: true }).reply(201, { id: 's3' })
        .post('/webhooks/v3/42/subscriptions', { eventType: 'contact.creation', active: true }).reply(201, { id: 's4' })
        .post('/webhooks/v3/42/subscriptions', { eventType: 'contact.propertyChange', propertyName: 'email', active: true }).reply(201, { id: 's5' });
    const plan = {
        extension: 'hubspot-webhooks', module: 'hubspot',
        desired: ['deal.creation', 'deal.propertyChange:dealstage', 'contact.creation', 'contact.propertyChange:email'],
        create: ['deal.propertyChange:dealstage', 'contact.creation', 'contact.propertyChange:email'],
        remove: ['company.deletion'],
        kept: ['deal.creation'],
        complete: true,
    };

    it('is add-only by default: creates the union of what bindings need and removes nothing', async () => {
        const api = provider();
        const [result] = await reconcileAppSubscriptions({ integrations: [alerts(), contacts()], listInstallations });
        expect(result).toEqual({ ...plan, created: plan.create, removed: [] });
        expect(api.isDone()).toBe(true);   // no DELETE was mocked, and disableNetConnect would have failed one
    });

    it('with prune: true, also removes what no binding needs', async () => {
        const api = provider().delete('/webhooks/v3/42/subscriptions/s2').reply(204);
        const [result] = await reconcileAppSubscriptions({ integrations: [alerts(), contacts()], listInstallations, prune: true });
        expect(result).toEqual({ ...plan, created: plan.create, removed: ['company.deletion'] });
        expect(api.isDone()).toBe(true);
    });

    it('a dry run reports create and remove and writes nothing, prune or not', async () => {
        for (const prune of [false, true]) {
            nock('https://api.hubapi.com').get('/webhooks/v3/42/subscriptions').reply(200, { results: [{ id: 's2', eventType: 'company.deletion' }] });
            const plain = defineIntegration({ name: 'plain', modules: { chat: slack } });
            const [result] = await reconcileAppSubscriptions({ integrations: [alerts(), plain], dryRun: true, prune });
            expect(result).toMatchObject({ create: ['deal.creation', 'deal.propertyChange:dealstage'], remove: ['company.deletion'], created: [], removed: [] });
            expect(nock.pendingMocks()).toEqual([]);
        }
    });

    it('does not prune when installation config cannot be read (a deploy step without the database)', async () => {
        nock('https://api.hubapi.com').get('/webhooks/v3/42/subscriptions').reply(200, { results: [{ id: 's2', eventType: 'company.deletion' }, { id: 's1', eventType: 'deal.creation' }, { id: 's3', eventType: 'deal.propertyChange', propertyName: 'dealstage' }] });
        const [result] = await reconcileAppSubscriptions({ integrations: [alerts(), contacts()], listInstallations: null, prune: true });
        expect(result).toMatchObject({ complete: false, removed: [], pruneSkipped: expect.stringMatching(/desired set is incomplete/) });
    });
});

describe('lifecycle invoker (installation create / update / delete)', () => {
    beforeEach(() => { process.env.HUBSPOT_APP_ID = '42'; });

    const Contacts = () => defineIntegration({
        name: 'contact-sync',
        modules: { crm: use(hubspot, { webhooks: { subscribe: (config) => config.topics || [] } }) },
        config: { topics: { type: 'array', items: { type: 'string' } } },
    });
    const installation = (Cls, status = 'ENABLED', config = { topics: ['contact.creation', 'contact.deletion'] }) => {
        const i = new Cls({ id: 'int-1', userId: 'u', status, config: { type: 'contact-sync', ...config }, modules: [] });
        i.validateConfig = async () => false;
        i.persistStatus = async (s) => { i.status = s; };
        i.patchConfig = async (c) => { i.config = { ...i.config, ...c }; };
        i.reportTriggerChoices = async () => [];
        i.updateIntegrationMessages = { execute: jest.fn() };
        return i;
    };

    it('on create, adds what this installation needs (add-only)', async () => {
        const api = nock('https://api.hubapi.com')
            .get('/webhooks/v3/42/subscriptions').reply(200, { results: [{ id: 's1', eventType: 'contact.deletion' }, { id: 's9', eventType: 'company.creation' }] })
            .post('/webhooks/v3/42/subscriptions', { eventType: 'contact.creation', active: true }).reply(201, { id: 's2' });
        const i = installation(Contacts());
        await i.onCreate();
        expect(api.isDone()).toBe(true);
    });

    it('on config update, adds the newly needed ones', async () => {
        const api = nock('https://api.hubapi.com')
            .get('/webhooks/v3/42/subscriptions').reply(200, { results: [{ id: 's1', eventType: 'contact.creation' }] })
            .post('/webhooks/v3/42/subscriptions', { eventType: 'contact.propertyChange', propertyName: 'email', active: true }).reply(201, { id: 's3' });
        const i = installation(Contacts(), 'ENABLED', { topics: ['contact.creation'] });
        await i.onUpdate({ config: { topics: ['contact.creation', 'contact.propertyChange:email'] } });
        expect(api.isDone()).toBe(true);
    });

    it('on delete, calls the provider not at all (removal is a pruning reconcile)', async () => {
        const i = installation(Contacts());
        await expect(i.onDelete()).resolves.toBeUndefined();
        expect(nock.pendingMocks()).toEqual([]);
    });

    it('skips static options (handled after deploy) and installations that are not ENABLED', async () => {
        const Static = alerts();
        const s = new Static({ id: 'a', status: 'ENABLED', config: { type: 'deal-alerts' }, modules: [] });
        expect(await s.syncInstallationSubscriptions('create')).toEqual([]);
        expect(await installation(Contacts(), 'NEEDS_CONFIG').syncInstallationSubscriptions('create')).toEqual([]);
    });

    it('a provider failure is a warning on the installation, not a failed create', async () => {
        nock('https://api.hubapi.com').get('/webhooks/v3/42/subscriptions').reply(500, { message: 'down' });
        const i = installation(Contacts());
        await expect(i.onCreate()).resolves.toBeUndefined();
        expect(i.updateIntegrationMessages.execute).toHaveBeenCalledWith('int-1', 'warnings', 'Webhook subscriptions not created', expect.any(String), expect.any(Number));
    });
});

describe('admin-script invoker', () => {
    beforeEach(() => { process.env.HUBSPOT_APP_ID = '42'; });

    it('is an admin script with prune and dryRun inputs, add-only unless prune is set', async () => {
        const Script = createReconcileSubscriptionsScript({ name: 'hubspot.reconcile-subscriptions', extension: 'hubspot-webhooks', loadIntegrations: () => [alerts()] });
        expect(Script.Definition).toMatchObject({ name: 'hubspot.reconcile-subscriptions', inputSchema: { properties: { prune: { type: 'boolean', default: false }, dryRun: { type: 'boolean', default: false } } } });
        nock('https://api.hubapi.com').get('/webhooks/v3/42/subscriptions').reply(200, { results: [{ id: 's2', eventType: 'company.deletion' }] });
        const dry = await new Script().execute({ dryRun: true, prune: true });
        expect(dry.results[0]).toMatchObject({ remove: ['company.deletion'], removed: [], created: [] });
        nock('https://api.hubapi.com').get('/webhooks/v3/42/subscriptions').reply(200, { results: [] });
        const flagged = await new Script().execute({ args: ['--prune', '--dry-run'] });
        expect(flagged).toMatchObject({ prune: true, dryRun: true });
    });

    it('defineApp appends the scripts bound modules export, once each', () => {
        const Script = createReconcileSubscriptionsScript({ name: 'hubspot.reconcile-subscriptions', extension: 'hubspot-webhooks' });
        const withScripts = { ...hubspot, scripts: [Script] };
        const A = defineIntegration({ name: 'a', modules: { crm: use(withScripts, { webhooks: { subscribe: ['deal.creation'] } }) } });
        const B = defineIntegration({ name: 'b', modules: { crm: withScripts } });
        expect(defineApp({ name: 'x', integrations: [A, B] }, { schemas: null }).Definition.adminScripts).toEqual([Script]);
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
