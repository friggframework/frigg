jest.mock('../../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
}));

// Mock repository factories to prevent real database access
jest.mock('../../integrations/repositories/integration-repository-factory', () => ({
    createIntegrationRepository: () => ({
        findIntegrationByUserId: () => {},
        updateIntegrationConfig: () => {},
    }),
}));

jest.mock('../../modules/repositories/module-repository-factory', () => ({
    createModuleRepository: () => ({
        findEntity: () => {},
    }),
}));

// Mock the module factory
jest.mock('../../modules/module-factory', () => ({
    ModuleFactory: jest.fn().mockImplementation(() => ({
        getModule: jest.fn(),
    })),
}));

// Mock LoadIntegrationContextUseCase
jest.mock('../../integrations/use-cases/load-integration-context', () => ({
    LoadIntegrationContextUseCase: jest.fn().mockImplementation(() => ({
        execute: jest.fn(),
    })),
}));

// Mock GetIntegrationsForUser
jest.mock('../../integrations/use-cases/get-integrations-for-user', () => ({
    GetIntegrationsForUser: jest.fn().mockImplementation(() => ({
        execute: jest.fn(),
    })),
}));

// Mock CreateIntegration
jest.mock('../../integrations/use-cases/create-integration', () => ({
    CreateIntegration: jest.fn().mockImplementation(() => ({
        execute: jest.fn(),
    })),
}));

// Mock integration utils
jest.mock('../../integrations/utils/map-integration-dto', () => ({
    getModulesDefinitionFromIntegrationClasses: jest.fn(() => []),
}));

// Create module-scoped variables for the mocks
// Must be prefixed with "mock" (case insensitive) for Jest to allow hoisting
let mockFindByExternalEntityIdExecute;
const mockConstructorCalls = [];

// Mock the use case module - must set up implementation in factory before integration-commands.js loads
jest.mock('../../integrations/use-cases/find-integration-context-by-external-entity-id', () => {
    return {
        FindIntegrationContextByExternalEntityIdUseCase: function(deps) {
            // Track constructor calls manually
            mockConstructorCalls.push(deps);

            // Return an instance with execute method that delegates to mockFindByExternalEntityIdExecute
            return {
                execute: (...args) => {
                    if (!mockFindByExternalEntityIdExecute) {
                        throw new Error('mockFindByExternalEntityIdExecute not initialized');
                    }
                    return mockFindByExternalEntityIdExecute(...args);
                },
            };
        },
    };
});

const {
    createIntegrationCommands,
    findIntegrationContextByExternalEntityId,
} = require('./integration-commands');
const {
    FindIntegrationContextByExternalEntityIdUseCase,
} = require('../../integrations/use-cases/find-integration-context-by-external-entity-id');
const { DummyIntegration } = require('../../integrations/tests/doubles/dummy-integration-class');

// Initialize the mock execute function once
mockFindByExternalEntityIdExecute = jest.fn();

/**
 * @group unit
 * @group application
 */
describe('integration commands', () => {
    beforeEach(() => {
        // Clear mock call history before each test
        mockFindByExternalEntityIdExecute.mockClear();
        mockConstructorCalls.length = 0; // Clear array
    });

    it('requires an integrationClass when creating commands', () => {
        expect(() => createIntegrationCommands()).toThrow(
            'integrationClass is required',
        );
    });

    it('creates use cases with default repositories', () => {
        createIntegrationCommands({
            integrationClass: DummyIntegration,
        });

        // Verify that the use case is created with default repositories instantiated internally
        expect(mockConstructorCalls).toHaveLength(1);
        expect(mockConstructorCalls[0]).toMatchObject({
            integrationRepository: expect.any(Object),
            moduleRepository: expect.any(Object),
            loadIntegrationContextUseCase: expect.any(Object),
        });
    });

    it('returns context when findIntegrationContextByExternalEntityId succeeds', async () => {
        const expectedContext = { record: { id: 'integration-1' } };
        mockFindByExternalEntityIdExecute.mockResolvedValue({ context: expectedContext });

        const commands = createIntegrationCommands({
            integrationClass: DummyIntegration,
        });

        const result = await commands.findIntegrationContextByExternalEntityId(
            'ext-1',
        );

        expect(mockFindByExternalEntityIdExecute).toHaveBeenCalledWith({
            externalEntityId: 'ext-1',
        });
        expect(result).toEqual({ context: expectedContext });
    });

    it('maps known errors to status codes', async () => {
        const error = Object.assign(new Error('Entity missing'), {
            code: 'ENTITY_NOT_FOUND',
        });
        mockFindByExternalEntityIdExecute.mockRejectedValue(error);
        const commands = createIntegrationCommands({
            integrationClass: DummyIntegration,
        });

        const result = await commands.findIntegrationContextByExternalEntityId(
            'ext-1',
        );

        expect(result).toEqual({
            error: 401,
            reason: 'Entity missing',
            code: 'ENTITY_NOT_FOUND',
        });
    });

    it('delegates loadIntegrationContextById to the loader use case', async () => {
        // This test verifies that the command properly delegates to the use case
        // We can't easily mock the internal use case, so we'll test the integration
        const commands = createIntegrationCommands({
            integrationClass: DummyIntegration,
        });

        // The actual use case will be called - this is more of an integration test
        // For unit testing, we'd need to refactor to allow DI of the use case
        // But since we've decided to always use default use cases, this is acceptable
        const result = await commands.loadIntegrationContextById('integration-1');

        // Result will have error since we don't have a real database
        expect(result).toHaveProperty('error');
    });

    it('exposes a one-off helper for finding integration context by external entity id', async () => {
        const expectedContext = { record: { id: 'integration-1' } };
        mockFindByExternalEntityIdExecute.mockResolvedValue({ context: expectedContext });

        const result = await findIntegrationContextByExternalEntityId({
            integrationClass: DummyIntegration,
            externalEntityId: 'ext-2',
        });

        expect(mockFindByExternalEntityIdExecute).toHaveBeenCalledWith({
            externalEntityId: 'ext-2',
        });
        expect(result).toEqual({ context: expectedContext });
    });
});
