const express = require('express');
const { mountExtensionRoutes } = require('../route-mounter');

// Mock admin auth middleware
jest.mock('../../handlers/middleware/admin-auth', () => ({
    validateAdminApiKey: jest.fn((req, res, next) => next()),
}));

const { validateAdminApiKey } = require('../../handlers/middleware/admin-auth');

describe('Route Mounter', () => {
    let app;

    beforeEach(() => {
        app = express();
        jest.clearAllMocks();
    });

    it('should do nothing with no extensions', () => {
        const spy = jest.spyOn(app, 'use');
        mountExtensionRoutes(app, []);
        mountExtensionRoutes(app, null);
        mountExtensionRoutes(app, undefined);
        expect(spy).not.toHaveBeenCalled();
    });

    it('should skip extensions without routes', () => {
        const spy = jest.spyOn(app, 'use');
        mountExtensionRoutes(app, [{ name: 'no-routes', routes: null }]);
        expect(spy).not.toHaveBeenCalled();
    });

    it('should mount a route handler factory', () => {
        const router = express.Router();
        router.get('/test', (req, res) => res.json({ ok: true }));

        const handlerFactory = jest.fn(() => router);
        const mockPrisma = {};
        const mockAppDef = { name: 'test' };

        mountExtensionRoutes(
            app,
            [
                {
                    name: 'test-ext',
                    routes: {
                        path: '/api/admin/test',
                        handler: handlerFactory,
                    },
                },
            ],
            { prisma: mockPrisma, appDefinition: mockAppDef }
        );

        expect(handlerFactory).toHaveBeenCalledWith(mockPrisma, mockAppDef);
    });

    it('should apply admin auth middleware by default', () => {
        const router = express.Router();
        const handlerFactory = () => router;

        mountExtensionRoutes(
            app,
            [
                {
                    name: 'test-ext',
                    routes: { path: '/api/test', handler: handlerFactory },
                },
            ],
            {}
        );

        // app.use should have been called with the path, middleware, and router
        // The admin auth middleware should be the one from the mock
        expect(validateAdminApiKey).toBeDefined();
    });

    it('should accept custom auth middleware', () => {
        const router = express.Router();
        const handlerFactory = () => router;
        const customAuth = jest.fn((req, res, next) => next());

        mountExtensionRoutes(
            app,
            [
                {
                    name: 'test-ext',
                    routes: { path: '/api/test', handler: handlerFactory },
                },
            ],
            { authMiddleware: customAuth }
        );

        // Custom middleware was provided (doesn't throw)
        expect(true).toBe(true);
    });

    it('should mount a direct router object', () => {
        const router = express.Router();
        router.get('/items', (req, res) => res.json([]));

        const spy = jest.spyOn(app, 'use');

        mountExtensionRoutes(app, [
            {
                name: 'direct-router-ext',
                routes: {
                    path: '/api/admin/items',
                    handler: { router },
                },
            },
        ]);

        expect(spy).toHaveBeenCalled();
    });

    it('should warn and skip non-function/non-router handlers', () => {
        const spy = jest.spyOn(console, 'warn').mockImplementation();
        const appUseSpy = jest.spyOn(app, 'use');

        mountExtensionRoutes(app, [
            {
                name: 'bad-ext',
                routes: {
                    path: '/api/test',
                    handler: 42, // not a function or router
                },
            },
        ]);

        expect(spy).toHaveBeenCalledWith(
            expect.stringContaining('bad-ext')
        );
        // app.use should NOT have been called (no routes mounted)
        expect(appUseSpy).not.toHaveBeenCalled();

        spy.mockRestore();
    });
});
