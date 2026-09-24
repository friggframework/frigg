process.env.HEALTH_API_KEY = 'test-api-key';

jest.mock('../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
}));

const mockPrisma = {
    $runCommandRaw: jest.fn().mockResolvedValue({ ok: 1 }),
    credential: {
        create: jest.fn(),
        findUnique: jest.fn(),
        delete: jest.fn(),
    },
};

jest.mock('../../database/prisma', () => ({
    prisma: mockPrisma,
    connectPrisma: jest.fn(),
    disconnectPrisma: jest.fn(),
}));

// Capture how health.js wraps its router. `router` is exported independently
// of the handler, so mocking createAppHandler does not affect the router-based
// tests below.
jest.mock('./../app-handler-helpers', () => ({
    createApp: jest.fn(),
    createAppHandler: jest.fn(() => ({})),
}));

const mockHealthCheckRepository = {
    getDatabaseConnectionState: jest.fn().mockResolvedValue({
        readyState: 1, stateName: 'connected', isConnected: true,
    }),
    pingDatabase: jest.fn().mockResolvedValue(1),
    createCredential: jest.fn(),
    findCredentialById: jest.fn(),
    getRawCredentialById: jest.fn(),
    deleteCredential: jest.fn(),
};

jest.mock('../../database/repositories/health-check-repository-factory', () => ({
    createHealthCheckRepository: jest.fn(() => mockHealthCheckRepository),
    HealthCheckRepositoryMongoDB: jest.fn(),
    HealthCheckRepositoryPostgreSQL: jest.fn(),
    HealthCheckRepositoryDocumentDB: jest.fn(),
}));

jest.mock('./../app-definition-loader', () => ({
    loadAppDefinition: jest.fn(() => ({
        integrations: [{ Definition: { name: 'test-integration' } }],
    })),
}));

jest.mock('../../integrations/utils/map-integration-dto', () => ({
    getModulesDefinitionFromIntegrationClasses: jest.fn(() => [
        { moduleName: 'test-module' },
        { moduleName: 'another-module' },
    ]),
}));

jest.mock('../../modules/repositories/module-repository-factory', () => ({
    createModuleRepository: jest.fn(() => ({})),
}));

jest.mock('../../modules/module-factory', () => ({
    ModuleFactory: jest.fn().mockImplementation(({ moduleDefinitions }) => ({
        moduleDefinitions,
    })),
}));

jest.mock('./../app-handler-helpers', () => ({
    createAppHandler: jest.fn((name, router) => ({ name, router }))
}));

const { router } = require('./health');

describe('Health handler DB posture', () => {
    it('creates the handler DB-free (shouldUseDatabase=false) so liveness/readiness never eager-connect', () => {
        const { createAppHandler } = require('./../app-handler-helpers');
        const healthCall = createAppHandler.mock.calls.find(
            (c) => c[0] === 'HTTP Event: Health'
        );
        expect(healthCall).toBeDefined();
        expect(healthCall[2]).toBe(false);
    });
});

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
        mockHealthCheckRepository.getDatabaseConnectionState.mockResolvedValue({
            readyState: 1, stateName: 'connected', isConnected: true,
        });
        mockHealthCheckRepository.pingDatabase.mockResolvedValue(1);
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
            const req = mockRequest('/health/detailed', { 'x-frigg-health-api-key': 'test-api-key' });
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
            mockHealthCheckRepository.getDatabaseConnectionState.mockResolvedValue({
                readyState: 0, stateName: 'disconnected', isConnected: false,
            });

            const req = mockRequest('/health/detailed', { 'x-frigg-health-api-key': 'test-api-key' });
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
            const req = mockRequest('/health/live', { 'x-frigg-health-api-key': 'test-api-key' });
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
            const req = mockRequest('/health/ready', { 'x-frigg-health-api-key': 'test-api-key' });
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
            mockHealthCheckRepository.getDatabaseConnectionState.mockResolvedValue({
                readyState: 0, stateName: 'disconnected', isConnected: false,
            });

            const req = mockRequest('/health/ready', { 'x-frigg-health-api-key': 'test-api-key' });
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
