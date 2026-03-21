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
