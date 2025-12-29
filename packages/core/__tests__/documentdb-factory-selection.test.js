const CONFIG_MOCK_PATH = '../database/config';

const FACTORIES = [
    {
        modulePath: '../credential/repositories/credential-repository-factory',
        factoryName: 'createCredentialRepository',
        exportName: 'CredentialRepositoryDocumentDB',
    },
    {
        modulePath: '../token/repositories/token-repository-factory',
        factoryName: 'createTokenRepository',
        exportName: 'TokenRepositoryDocumentDB',
    },
    {
        modulePath: '../modules/repositories/module-repository-factory',
        factoryName: 'createModuleRepository',
        exportName: 'ModuleRepositoryDocumentDB',
    },
    {
        modulePath:
            '../integrations/repositories/integration-repository-factory',
        factoryName: 'createIntegrationRepository',
        exportName: 'IntegrationRepositoryDocumentDB',
    },
    {
        modulePath:
            '../integrations/repositories/integration-mapping-repository-factory',
        factoryName: 'createIntegrationMappingRepository',
        exportName: 'IntegrationMappingRepositoryDocumentDB',
    },
    {
        modulePath: '../integrations/repositories/process-repository-factory',
        factoryName: 'createProcessRepository',
        exportName: 'ProcessRepositoryDocumentDB',
    },
    {
        modulePath: '../syncs/repositories/sync-repository-factory',
        factoryName: 'createSyncRepository',
        exportName: 'SyncRepositoryDocumentDB',
    },
    {
        modulePath: '../user/repositories/user-repository-factory',
        factoryName: 'createUserRepository',
        exportName: 'UserRepositoryDocumentDB',
    },
    {
        modulePath:
            '../websocket/repositories/websocket-connection-repository-factory',
        factoryName: 'createWebsocketConnectionRepository',
        exportName: 'WebsocketConnectionRepositoryDocumentDB',
    },
];

describe('DocumentDB factory selection', () => {
    afterEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
    });

    const configMock = {
        DB_TYPE: 'documentdb',
        getDatabaseType: jest.fn(() => 'documentdb'),
        PRISMA_LOG_LEVEL: 'error,warn',
        PRISMA_QUERY_LOGGING: false,
    };

    test.each(FACTORIES)(
        'returns DocumentDB implementation for %p when DB_TYPE=documentdb',
        ({ modulePath, factoryName, exportName }) => {
            jest.resetModules();

            jest.doMock(CONFIG_MOCK_PATH, () => configMock);

            const factoryModule = require(modulePath);
            const instance = factoryModule[factoryName]();

            expect(instance).toBeInstanceOf(factoryModule[exportName]);
        }
    );

    test('health-check factory returns DocumentDB implementation when DB_TYPE=documentdb', () => {
        jest.resetModules();
        jest.doMock(CONFIG_MOCK_PATH, () => configMock);

        const {
            createHealthCheckRepository,
            HealthCheckRepositoryDocumentDB,
        } = require('../database/repositories/health-check-repository-factory');

        const prismaClientStub = {
            $runCommandRaw: jest.fn(),
        };

        const repository = createHealthCheckRepository({
            prismaClient: prismaClientStub,
        });

        expect(repository).toBeInstanceOf(HealthCheckRepositoryDocumentDB);
    });
});
