/**
 * A defineIntegration app (ADR-054) provisions through the existing builders with no new path: the contract-2
 * binding gets its own function under the derived key, and `triggers` get the ADR-055 tick.
 */
jest.mock('@friggframework/core/database/config', () => ({ DB_TYPE: 'mongodb', getDatabaseType: jest.fn(() => 'mongodb'), PRISMA_LOG_LEVEL: 'error,warn' }));

const { defineApp, defineIntegration, use } = require('@friggframework/core/integrations/define');
const { IntegrationBuilder } = require('./integration-builder');
const { TriggerBuilder } = require('../scheduler/trigger-builder');

/** A module with a contract-2 webhooks extension, reduced to what provisioning reads. */
const crmModule = {
    Definition: { moduleName: 'crm-vendor', getName: () => 'crm-vendor' },
    extensions: {
        webhooks: {
            name: 'crm-vendor-webhooks',
            contract: 2,
            useDatabase: false,
            routes: [{ path: '/webhooks', method: 'POST' }],
            receive: (input) => [{ externalId: input.body.account, body: input.body }],
            resolve: { module: 'crm-vendor' },
            emits: { 'deal.changed': {} },
        },
    },
};
const chatModule = { Definition: { moduleName: 'chat-vendor', getName: () => 'chat-vendor' } };

const app = defineApp({
    name: 'deal-alerts',
    integrations: [
        defineIntegration({
            name: 'deal-alerts',
            modules: { crm: use(crmModule, { webhooks: {} }), chat: use(chatModule) },
            on: { 'crm.deal.changed': async () => {} },
            triggers: { digest: { every: '1h', handler: async () => {} } },
        }),
    ],
}, { schemas: null });

describe('a defineIntegration app on the existing builders', () => {
    beforeEach(() => { jest.spyOn(console, 'log').mockImplementation(() => {}); });
    afterEach(() => { jest.restoreAllMocks(); });

    it('gives the contract-2 binding its own function, routed under the module key', async () => {
        const result = await new IntegrationBuilder().build(app.Definition, {});
        const fn = result.functions['deal-alerts__crmwebhooks'];
        expect(fn.handler).toBe('node_modules/@friggframework/core/handlers/routers/integration-defined-routers.handlers.deal-alerts__crmwebhooks.handler');
        expect(fn.events).toEqual([{ httpApi: { path: '/api/deal-alerts-integration/crm-webhooks/webhooks', method: 'POST' } }]);
        expect(fn.layers).toBeUndefined();   // useDatabase: false, so no Prisma layer
        expect(result.functions['deal-alertsQueueWorker']).toBeDefined();
    });

    it('provisions the ADR-055 tick for its triggers', async () => {
        const builder = new TriggerBuilder();
        expect(builder.shouldExecute(app.Definition)).toBe(true);
        const result = await builder.build(app.Definition, {});
        expect(JSON.stringify(result)).toContain('rate(1 hour)');
    });
});
