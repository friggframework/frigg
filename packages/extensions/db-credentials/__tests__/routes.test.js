const express = require('express');
const createRouter = require('../routes');

// Minimal test helper — avoids bringing in supertest as a dependency
function createTestApp(prisma) {
    const app = express();
    app.use(express.json());
    app.use('/creds', createRouter(prisma));
    return app;
}

describe('db-credentials routes', () => {
    it('should export a function that returns an express router', () => {
        expect(typeof createRouter).toBe('function');

        const mockPrisma = {
            oAuthAppCredential: {
                findMany: jest.fn(),
                findUnique: jest.fn(),
                upsert: jest.fn(),
                delete: jest.fn(),
            },
        };

        const router = createRouter(mockPrisma);
        expect(router).toBeDefined();
        // Express routers have a stack of route layers
        expect(router.stack).toBeDefined();
    });

    it('should define GET, PUT, DELETE routes', () => {
        const mockPrisma = {
            oAuthAppCredential: {
                findMany: jest.fn(),
                findUnique: jest.fn(),
                upsert: jest.fn(),
                delete: jest.fn(),
            },
        };

        const router = createRouter(mockPrisma);
        const routes = router.stack
            .filter((layer) => layer.route)
            .map((layer) => ({
                path: layer.route.path,
                methods: Object.keys(layer.route.methods),
            }));

        expect(routes).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ path: '/', methods: ['get'] }),
                expect.objectContaining({ path: '/:moduleName', methods: ['get'] }),
                expect.objectContaining({ path: '/:moduleName', methods: ['put'] }),
                expect.objectContaining({ path: '/:moduleName', methods: ['delete'] }),
            ])
        );
    });
});

describe('db-credentials routes without the composed schema', () => {
    async function request(app, method, path) {
        const server = app.listen(0);
        try {
            const { port } = server.address();
            const res = await fetch(`http://127.0.0.1:${port}${path}`, { method });
            return { status: res.status, body: await res.json() };
        } finally {
            server.close();
        }
    }

    it('answers 503 EXTENSION_SCHEMA_NOT_COMPOSED when the Prisma model is missing', async () => {
        const app = createTestApp({});
        for (const [method, path] of [['GET', '/creds'], ['GET', '/creds/hubspot'], ['DELETE', '/creds/hubspot']]) {
            const res = await request(app, method, path);
            expect(res.status).toBe(503);
            expect(res.body.code).toBe('EXTENSION_SCHEMA_NOT_COMPOSED');
        }
    });

    it('serves normally when the model exists', async () => {
        const app = createTestApp({ oAuthAppCredential: { findMany: jest.fn(async () => []) } });
        const res = await request(app, 'GET', '/creds');
        expect(res.status).toBe(200);
        expect(res.body).toEqual([]);
    });
});
