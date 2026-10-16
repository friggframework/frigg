/**
 * ADR-059 at integration commands: the module factory for an integration
 * class is built from the app registry. Real loader and registry; only the
 * repositories and the factory (to read what it was given) are doubles.
 */
jest.mock('../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
}));
jest.mock('../../modules/module-factory', () => ({
    ModuleFactory: jest.fn(() => ({})),
}));
jest.mock(
    '../../integrations/repositories/integration-repository-factory',
    () => ({
        createIntegrationRepository: jest.fn(() => ({})),
    })
);
jest.mock('../../modules/repositories/module-repository-factory', () => ({
    createModuleRepository: jest.fn(() => ({})),
}));

const { ModuleFactory } = require('../../modules/module-factory');
const { createIntegrationCommands } = require('./integration-commands');
const {
    DummyIntegration,
} = require('../../integrations/tests/doubles/dummy-integration-class');

describe('createIntegrationCommands and the entity registry (ADR-059)', () => {
    afterEach(() => jest.clearAllMocks());

    it('gives the factory the module definitions it is handed (the app registry)', () => {
        const registryOnly = { moduleName: 'xero' };
        const moduleDefinitions = [registryOnly, { moduleName: 'hubspot' }];

        createIntegrationCommands({
            integrationClass: DummyIntegration,
            moduleDefinitions,
        });

        expect(ModuleFactory.mock.calls[0][0].moduleDefinitions).toBe(
            moduleDefinitions
        );
    });

    it('without any, hydrates with the integration’s own modules only (explicit fallback)', () => {
        createIntegrationCommands({ integrationClass: DummyIntegration });

        const { moduleDefinitions } = ModuleFactory.mock.calls[0][0];
        expect(moduleDefinitions.map((d) => d.getName())).toEqual(['dummy']);
    });

    it('createFriggCommands passes them through', () => {
        const { createFriggCommands } = require('../index');
        const moduleDefinitions = [{ moduleName: 'xero' }];

        createFriggCommands({
            integrationClass: DummyIntegration,
            moduleDefinitions,
        });

        expect(ModuleFactory.mock.calls[0][0].moduleDefinitions).toBe(
            moduleDefinitions
        );
    });
});
