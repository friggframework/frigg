/**
 * Health sees entity types registered on the app (ADR-059), not only the ones
 * an integration binds. Drives the real registry; only IO is faked.
 */
process.env.HEALTH_API_KEY = 'test-api-key';

jest.mock('../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
}));
jest.mock('../../database/prisma', () => ({
    prisma: {},
    connectPrisma: jest.fn(),
    disconnectPrisma: jest.fn(),
}));
jest.mock('./../app-handler-helpers', () => ({
    createApp: jest.fn(),
    createAppHandler: jest.fn(() => ({})),
}));
jest.mock(
    '../../database/repositories/health-check-repository-factory',
    () => ({
        createHealthCheckRepository: jest.fn(() => ({
            getDatabaseConnectionState: jest.fn().mockResolvedValue({
                readyState: 1,
                stateName: 'connected',
                isConnected: true,
            }),
            pingDatabase: jest.fn().mockResolvedValue(1),
        })),
    })
);
jest.mock('../../modules/repositories/module-repository-factory', () => ({
    createModuleRepository: jest.fn(() => ({})),
}));
jest.mock('../../modules/module-factory', () => ({
    ModuleFactory: jest.fn().mockImplementation(({ moduleDefinitions }) => ({
        moduleDefinitions,
    })),
}));

const google = { moduleName: 'google' };
const hubspot = { moduleName: 'hubspot' };
const integration = (name, definition) => ({
    Definition: { name, modules: { crm: { definition } } },
});

const {
    getEntityTypeRegistry,
    getEntityTypeDefinitions,
} = require('../../modules/entity-type-registry');

// What loadAppDefinition() hands back: the definition plus its registry.
const loaded = (appDefinition) => {
    const entityTypeRegistry = getEntityTypeRegistry(appDefinition);
    return {
        ...appDefinition,
        entityTypeRegistry,
        moduleDefinitions: getEntityTypeDefinitions(entityTypeRegistry),
    };
};

const loadHealthRouter = (appDefinition) => {
    jest.resetModules();
    jest.doMock('./../app-definition-loader', () => ({
        loadAppDefinition: jest.fn(() => loaded(appDefinition)),
    }));
    return require('./health').router;
};

const callRoute = async (router, path) => {
    const handler = router.stack.find(
        (layer) => layer.route && layer.route.path === path
    ).route.stack[0].handle;
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    await handler(
        { path, headers: { 'x-frigg-health-api-key': 'test-api-key' } },
        res
    );
    return res;
};

describe('health: entity registry (ADR-059)', () => {
    let logSpy;
    beforeEach(() => {
        logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    });
    afterEach(() => logSpy.mockRestore());

    it('lists a registry-only module as an available module and is ready with no integration', async () => {
        const router = loadHealthRouter({
            integrations: [],
            entities: { google: { definition: google } },
        });

        const res = await callRoute(router, '/health/ready');

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                ready: true,
                checks: expect.objectContaining({ modules: true }),
            })
        );
    });

    it('reports registry and inferred modules together', async () => {
        const router = loadHealthRouter({
            integrations: [integration('sync', hubspot)],
            entities: { google: { definition: google } },
        });
        const errorSpy = jest
            .spyOn(console, 'error')
            .mockImplementation(() => {});

        const res = await callRoute(router, '/health/detailed');
        errorSpy.mockRestore();

        const { integrations } = res.json.mock.calls[0][0].checks;
        expect(integrations.modules.available.sort()).toEqual([
            'google',
            'hubspot',
        ]);
        expect(integrations.integrations.available).toEqual(['sync']);
    });

    it('an app with no entities key reports exactly the integration-bound modules', async () => {
        const router = loadHealthRouter({
            integrations: [integration('sync', hubspot)],
        });
        const errorSpy = jest
            .spyOn(console, 'error')
            .mockImplementation(() => {});

        const res = await callRoute(router, '/health/detailed');
        errorSpy.mockRestore();

        expect(
            res.json.mock.calls[0][0].checks.integrations.modules.available
        ).toEqual(['hubspot']);
    });
});
