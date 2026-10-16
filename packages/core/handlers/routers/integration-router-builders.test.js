/**
 * The pure router builders behind the AWS integration/webhook handlers,
 * which provider-netlify mounts in its integration-routes and webhooks
 * functions so both hosts serve the same routes.
 */
jest.mock('../../database/config', () => ({
    DB_TYPE: 'postgresql',
    getDatabaseType: jest.fn(() => 'postgresql'),
    PRISMA_LOG_LEVEL: 'error,warn',
}));
jest.mock('../app-definition-loader', () => ({
    loadAppDefinition: () => ({ integrations: [] }),
}));

const { IntegrationBase } = require('../../integrations/integration-base');
const { createApp } = require('../app-handler-helpers');
const { request } = require('../../management-api/test-support/http-client');
const { createMemorySink } = require('../../logs');
const {
    buildIntegrationRouters,
    createIntegrationDefinedRouter,
} = require('./integration-defined-routers');
const {
    buildWebhookRouters,
    createWebhookRouter,
} = require('./integration-webhook-routers');

class WithRoutes extends IntegrationBase {
    static Definition = {
        name: 'with-routes',
        version: '1.0.0',
        modules: {},
        routes: [{ path: '/ping', method: 'GET', event: 'PING' }],
        webhooks: true,
    };

    constructor(params) {
        super(params);
        this.events = {
            PING: { handler: async () => ({ pong: true }) },
            WEBHOOK_RECEIVED: {
                handler: async ({ res }) => res.status(202).json({ received: 'with-routes' }),
            },
        };
    }
}

class NoWebhooks extends IntegrationBase {
    static Definition = { name: 'no-webhooks', version: '1.0.0', modules: {} };
}

describe('integration router builders', () => {
    beforeEach(() => createMemorySink());

    it('build one entry per integration with routes', () => {
        const entries = buildIntegrationRouters([WithRoutes, NoWebhooks]);
        expect(entries.map((e) => e.key)).toEqual(['with-routes', 'no-webhooks']);
        expect(entries.every((e) => e.useDatabase === true)).toBe(true);
    });

    it('build webhook entries only for integrations with webhooks enabled', () => {
        expect(buildWebhookRouters([WithRoutes, NoWebhooks]).map((e) => e.key)).toEqual([
            'with-routesWebhook',
        ]);
    });

    it('the combined integration router serves Definition.routes', async () => {
        const app = createApp((a) => a.use(createIntegrationDefinedRouter([WithRoutes])));
        const res = await request(app, { path: '/api/with-routes-integration/ping' });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ pong: true });
    });

    it('the combined webhook router dispatches WEBHOOK_RECEIVED and 404s a disabled integration', async () => {
        const app = createApp((a) => a.use(createWebhookRouter([WithRoutes, NoWebhooks])));

        const ok = await request(app, {
            method: 'POST',
            path: '/api/with-routes-integration/webhooks',
            body: {},
        });
        expect(ok.status).toBe(202);
        expect(ok.body).toEqual({ received: 'with-routes' });

        const none = await request(app, {
            method: 'POST',
            path: '/api/no-webhooks-integration/webhooks',
            body: {},
        });
        expect(none.status).toBe(404);
    });
});
