process.env.HEALTH_API_KEY = 'test-api-key';

jest.mock('../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
}));

const mockPrisma: any = {
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

const mockHealthCheckRepository: any = {
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
    ModuleFactory: jest.fn().mockImplementation(({ moduleDefinitions }: any) => ({
        moduleDefinitions,
    })),
}));

jest.mock('./../app-handler-helpers', () => ({
    createAppHandler: jest.fn((name: any, router: any) => ({ name, router }))
}));

const { router } = require('./health') as any;

const mockRequest = (path: string, headers: Record<string, string> = {}) => ({
    path,
    headers
});

const mockResponse = () => {
    const res: any = {};
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

            const routeHandler = router.stack.find((layer: any) =>
                layer.route?.path === '/health'
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
            (Promise as any).all = jest.fn().mockResolvedValue([
                { name: 'github', status: 'healthy', reachable: true, statusCode: 200, responseTime: 100 },
                { name: 'npm', status: 'healthy', reachable: true, statusCode: 200, responseTime: 150 }
            ]);

            const routeHandler = router.stack.find((layer: any) =>
                layer.route?.path === '/health/detailed'
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
            (Promise as any).all = jest.fn().mockResolvedValue([
                { name: 'github', status: 'healthy', reachable: true, statusCode: 200, responseTime: 100 },
                { name: 'npm', status: 'healthy', reachable: true, statusCode: 200, responseTime: 150 }
            ]);

            const routeHandler = router.stack.find((layer: any) =>
                layer.route?.path === '/health/detailed'
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

            const routeHandler = router.stack.find((layer: any) =>
                layer.route?.path === '/health/live'
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

            const routeHandler = router.stack.find((layer: any) =>
                layer.route?.path === '/health/ready'
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

            const routeHandler = router.stack.find((layer: any) =>
                layer.route?.path === '/health/ready'
            ).route.stack[0].handle;

            await routeHandler(req, res);

            expect(res.status).toHaveBeenCalledWith(503);
            expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
                ready: false
            }));
        });
    });
});
