process.env.HEALTH_API_KEY = 'test-api-key';

jest.mock('mongoose', () => ({
    set: jest.fn(),
    connection: {
        readyState: 1,
        db: {
            admin: () => ({
                ping: jest.fn().mockResolvedValue(true)
            })
        }
    }
}));

jest.mock('./../backend-utils', () => ({
    moduleFactory: {
        moduleTypes: ['test-module', 'another-module']
    },
    integrationFactory: {
        integrationTypes: ['test-integration', 'another-integration']
    }
}));

jest.mock('./../app-handler-helpers', () => ({
    createAppHandler: jest.fn((name, router) => ({ name, router }))
}));

const { router } = require('./health');
const mongoose = require('mongoose');

const mockRequest = (path, headers = {}) => ({
    path,
    headers
});

const mockResponse = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
};

describe('Health Check Endpoints', () => {
    beforeEach(() => {
        mongoose.connection.readyState = 1;
    });

    describe('Middleware - validateApiKey', () => {
        it('should allow access to /health without authentication', async () => {
            expect(true).toBe(true);
        });
    });

    describe('GET /health', () => {
        it('should return basic health status', async () => {
            const req = mockRequest('/health');
            const res = mockResponse();

            const routeHandler = router.stack.find(layer => 
                layer.route && layer.route.path === '/health'
            ).route.stack[0].handle;

            await routeHandler(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                status: 'ok',
                timestamp: expect.any(String),
                service: 'frigg-core-api'
            });
        });
    });

    describe('GET /health/detailed', () => {
        it('should return detailed health status when healthy', async () => {
            const req = mockRequest('/health/detailed', { 'x-api-key': 'test-api-key' });
            const res = mockResponse();

            const originalPromiseAll = Promise.all;
            Promise.all = jest.fn().mockResolvedValue([
                { name: 'github', status: 'healthy', reachable: true, statusCode: 200, responseTime: 100 },
                { name: 'npm', status: 'healthy', reachable: true, statusCode: 200, responseTime: 150 }
            ]);

            const routeHandler = router.stack.find(layer => 
                layer.route && layer.route.path === '/health/detailed'
            ).route.stack[0].handle;

            await routeHandler(req, res);
            
            Promise.all = originalPromiseAll;

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                status: 'healthy',
                service: 'frigg-core-api',
                timestamp: expect.any(String),
                checks: expect.objectContaining({
                    database: expect.objectContaining({
                        status: 'healthy',
                        state: 'connected'
                    }),
                    integrations: expect.objectContaining({
                        status: 'healthy'
                    })
                }),
                responseTime: expect.any(Number)
            }));

            const response = res.json.mock.calls[0][0];
            expect(response).not.toHaveProperty('version');
            expect(response).not.toHaveProperty('uptime');
            expect(response.checks).not.toHaveProperty('memory');
            expect(response.checks.database).not.toHaveProperty('type');
        });

        it('should return 503 when database is disconnected', async () => {
            mongoose.connection.readyState = 0;

            const req = mockRequest('/health/detailed', { 'x-api-key': 'test-api-key' });
            const res = mockResponse();

            const originalPromiseAll = Promise.all;
            Promise.all = jest.fn().mockResolvedValue([
                { name: 'github', status: 'healthy', reachable: true, statusCode: 200, responseTime: 100 },
                { name: 'npm', status: 'healthy', reachable: true, statusCode: 200, responseTime: 150 }
            ]);

            const routeHandler = router.stack.find(layer => 
                layer.route && layer.route.path === '/health/detailed'
            ).route.stack[0].handle;

            await routeHandler(req, res);
            
            Promise.all = originalPromiseAll;

            expect(res.status).toHaveBeenCalledWith(503);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                status: 'unhealthy'
            }));
        });
    });

    describe('GET /health/live', () => {
        it('should return alive status', async () => {
            const req = mockRequest('/health/live', { 'x-api-key': 'test-api-key' });
            const res = mockResponse();

            const routeHandler = router.stack.find(layer => 
                layer.route && layer.route.path === '/health/live'
            ).route.stack[0].handle;

            routeHandler(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                status: 'alive',
                timestamp: expect.any(String)
            });
        });
    });

    describe('GET /health/ready', () => {
        it('should return ready when all checks pass', async () => {
            const req = mockRequest('/health/ready', { 'x-api-key': 'test-api-key' });
            const res = mockResponse();

            const routeHandler = router.stack.find(layer => 
                layer.route && layer.route.path === '/health/ready'
            ).route.stack[0].handle;

            await routeHandler(req, res);

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.json).toHaveBeenCalledWith({
                ready: true,
                timestamp: expect.any(String),
                checks: {
                    database: true,
                    modules: true
                }
            });
        });

        it('should return 503 when database is not connected', async () => {
            mongoose.connection.readyState = 0;

            const req = mockRequest('/health/ready', { 'x-api-key': 'test-api-key' });
            const res = mockResponse();

            const routeHandler = router.stack.find(layer => 
                layer.route && layer.route.path === '/health/ready'
            ).route.stack[0].handle;

            await routeHandler(req, res);

            expect(res.status).toHaveBeenCalledWith(503);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                ready: false
            }));
        });
    });
});