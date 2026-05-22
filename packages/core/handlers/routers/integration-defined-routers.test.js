jest.mock('../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
}));

const express = require('express');
const http = require('http');
const { IntegrationBase } = require('../../integrations/integration-base');
const { loadRouterFromObject } = require('../backend-utils');
const { getExtensionRoutes } = require('../../integrations/extension');

const stubWebhookExtension = {
    name: 'stub-webhooks',
    routes: [{ path: '/stub-hook', method: 'POST', event: 'STUB_EVENT' }],
    events: {
        STUB_EVENT: {
            type: 'LIFE_CYCLE_EVENT',
            handler: async function defaultHandler({ req }) {
                return { source: 'extension-default', body: req.body };
            },
        },
    },
};

class StubIntegration extends IntegrationBase {
    static Definition = {
        name: 'stub',
        version: '1.0.0',
        modules: {},
        extensions: {
            stubExt: {
                extension: stubWebhookExtension,
                handlers: { STUB_EVENT: 'onStub' },
            },
        },
    };

    constructor(params) {
        super(params);
        StubIntegration.callLog = StubIntegration.callLog || [];
    }

    async onStub({ req }) {
        StubIntegration.callLog.push({ body: req.body });
        return { source: 'integration-method', echo: req.body };
    }
}

const startServer = (router) =>
    new Promise((resolve) => {
        const app = express();
        app.use(express.json());
        app.use('/api/stub-integration', router);
        const server = app.listen(0, () => {
            const port = server.address().port;
            resolve({ server, port });
        });
    });

const stopServer = (server) =>
    new Promise((resolve) => server.close(resolve));

const postJson = (port, path, body) =>
    new Promise((resolve, reject) => {
        const data = JSON.stringify(body);
        const req = http.request(
            {
                hostname: '127.0.0.1',
                port,
                method: 'POST',
                path,
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data),
                },
            },
            (res) => {
                let chunks = '';
                res.on('data', (c) => (chunks += c));
                res.on('end', () =>
                    resolve({
                        status: res.statusCode,
                        body: chunks ? JSON.parse(chunks) : null,
                    })
                );
            }
        );
        req.on('error', reject);
        req.write(data);
        req.end();
    });

describe('integration-defined-routers — extension routes', () => {
    beforeEach(() => {
        StubIntegration.callLog = [];
    });

    it('getExtensionRoutes surfaces the extension-declared route with binding metadata', () => {
        const routes = getExtensionRoutes(StubIntegration);
        expect(routes).toHaveLength(1);
        expect(routes[0]).toMatchObject({
            bindingName: 'stubExt',
            extensionName: 'stub-webhooks',
            path: '/stub-hook',
            method: 'POST',
            event: 'STUB_EVENT',
        });
    });

    it('dispatches POST to the extension route through to the bound instance method', async () => {
        const routes = getExtensionRoutes(StubIntegration);
        const router = loadRouterFromObject(StubIntegration, routes[0]);

        const { server, port } = await startServer(router);
        try {
            const res = await postJson(port, '/api/stub-integration/stub-hook', {
                portalId: 12345,
                eventType: 'contact.creation',
            });

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                source: 'integration-method',
                echo: { portalId: 12345, eventType: 'contact.creation' },
            });
            expect(StubIntegration.callLog).toHaveLength(1);
            expect(StubIntegration.callLog[0].body).toEqual({
                portalId: 12345,
                eventType: 'contact.creation',
            });
        } finally {
            await stopServer(server);
        }
    });

    it('falls back to the extension default handler when no binding override is provided', async () => {
        class NoOverrideIntegration extends IntegrationBase {
            static Definition = {
                name: 'no-override',
                version: '1.0.0',
                modules: {},
                extensions: {
                    stubExt: { extension: stubWebhookExtension },
                },
            };
        }

        const [route] = getExtensionRoutes(NoOverrideIntegration);
        const router = loadRouterFromObject(NoOverrideIntegration, route);
        const { server, port } = await startServer(router);
        try {
            const res = await postJson(
                port,
                '/api/stub-integration/stub-hook',
                { hello: 'world' }
            );
            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                source: 'extension-default',
                body: { hello: 'world' },
            });
        } finally {
            await stopServer(server);
        }
    });
});

describe('integration-defined-routers — boot-time route conflict detection', () => {
    afterEach(() => {
        jest.resetModules();
    });

    it('throws when an extension route collides with a Definition.routes entry', () => {
        const extension = {
            name: 'collide-ext',
            routes: [{ path: '/hook', method: 'POST', event: 'X_EVENT' }],
            events: { X_EVENT: { handler: async () => null } },
        };
        class CollidingIntegration extends IntegrationBase {
            static Definition = {
                name: 'collider',
                version: '1.0.0',
                modules: {},
                routes: [{ path: '/hook', method: 'POST', event: 'OWN_EVENT' }],
                extensions: { ext: { extension } },
            };
        }
        jest.doMock('../app-definition-loader', () => ({
            loadAppDefinition: () => ({
                integrations: [CollidingIntegration],
            }),
        }));
        expect(() => require('./integration-defined-routers')).toThrow(
            /route conflict.*POST \/hook.*Definition\.routes.*extension "collide-ext"/
        );
    });

    it('throws when two extensions in the same integration share a path', () => {
        const extA = {
            name: 'ext-a',
            routes: [{ path: '/shared', method: 'POST', event: 'A_EVENT' }],
            events: { A_EVENT: { handler: async () => null } },
        };
        const extB = {
            name: 'ext-b',
            routes: [{ path: '/shared', method: 'POST', event: 'B_EVENT' }],
            events: { B_EVENT: { handler: async () => null } },
        };
        class DoubleColliderIntegration extends IntegrationBase {
            static Definition = {
                name: 'double-collide',
                version: '1.0.0',
                modules: {},
                extensions: { a: { extension: extA }, b: { extension: extB } },
            };
        }
        jest.doMock('../app-definition-loader', () => ({
            loadAppDefinition: () => ({
                integrations: [DoubleColliderIntegration],
            }),
        }));
        expect(() => require('./integration-defined-routers')).toThrow(
            /route conflict.*POST \/shared.*ext-a.*ext-b/
        );
    });
});
