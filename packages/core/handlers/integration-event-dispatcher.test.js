const { IntegrationEventDispatcher } = require('./integration-event-dispatcher');
const { IntegrationBase } = require('../integrations/integration-base');

// Mock dependencies
const mockIntegrationRepository = {
    findIntegrationByName: jest.fn()
};

const mockModuleRepository = {
    findEntitiesByIds: jest.fn()
};

const mockModuleFactory = {
    getModuleInstance: jest.fn()
};

// Create a test integration class
class TestIntegration extends IntegrationBase {
    static Definition = {
        name: 'test-integration',
        version: '1.0.0',
        modules: {},
        routes: [
            {
                path: '/auth',
                method: 'GET',
                event: 'AUTH_REQUEST'
            },
            {
                path: '/data',
                method: 'GET',
                event: 'LOAD_DATA'
            },
            {
                path: '/test',
                method: 'POST',
                event: 'TEST_EVENT'
            },
            {
                path: '/dynamic',
                method: 'GET',
                event: 'DYNAMIC_EVENT'
            }
        ]
    };

    constructor(params) {
        super(params);
        // Define events in constructor like AsanaIntegration does
        this.events = {
            'AUTH_REQUEST': {
                handler: this.authRequest.bind(this)
            },
            'LOAD_DATA': {
                handler: this.loadData.bind(this)
            },
            'TEST_EVENT': {
                handler: this.testHandler.bind(this)
            }
        };
    }

    async authRequest({ req, res }) {
        return {
            success: true,
            message: 'Auth request handled',
            hasDatabase: !!this.id
        };
    }

    async loadData({ req, res }) {
        if (!this.id) {
            throw new Error('Database record required');
        }
        return {
            success: true,
            data: this.config,
            integrationId: this.id
        };
    }

    async testHandler({ data }) {
        return {
            success: true,
            received: data
        };
    }

    async initialize() {
        // Simulate loading dynamic events
        const additionalEvents = {
            'DYNAMIC_EVENT': {
                handler: this.dynamicHandler.bind(this)
            }
        };
        this.events = { ...this.events, ...additionalEvents };
    }

    async dynamicHandler({ req }) {
        return { dynamic: true };
    }
}

describe('IntegrationEventDispatcher', () => {
    let dispatcher;

    beforeEach(() => {
        // Reset all mocks
        jest.clearAllMocks();

        // Create dispatcher instance
        dispatcher = new IntegrationEventDispatcher({
            integrationRepository: mockIntegrationRepository,
            moduleFactory: mockModuleFactory,
            moduleRepository: mockModuleRepository
        });
    });

    describe('dispatchHttp', () => {
        it('should handle auth request without database record (stateless)', async () => {
            // Mock no database record found
            mockIntegrationRepository.findIntegrationByName.mockResolvedValue(null);

            const req = { headers: {} };
            const res = { json: jest.fn() };
            const next = jest.fn();

            const result = await dispatcher.dispatchHttp({
                integrationClass: TestIntegration,
                event: 'AUTH_REQUEST',
                req,
                res,
                next
            });

            expect(result).toEqual({
                success: true,
                message: 'Auth request handled',
                hasDatabase: false
            });

            // Verify repository was called
            expect(mockIntegrationRepository.findIntegrationByName).toHaveBeenCalledWith('test-integration');

            // Verify modules were not loaded (stateless)
            expect(mockModuleRepository.findEntitiesByIds).not.toHaveBeenCalled();
            expect(mockModuleFactory.getModuleInstance).not.toHaveBeenCalled();
        });

        it('should handle request with database record (stateful)', async () => {
            // Mock database record
            const mockRecord = {
                id: 'integration-123',
                userId: 'user-456',
                config: { type: 'test', apiKey: 'secret' },
                status: 'ENABLED',
                version: '1.0.0',
                messages: { errors: [], warnings: [] },
                entitiesIds: ['entity-1', 'entity-2']
            };

            const mockEntities = [
                { _id: 'entity-1', name: 'module1' },
                { _id: 'entity-2', name: 'module2' }
            ];

            const mockModule1 = { getName: () => 'module1', api: {} };
            const mockModule2 = { getName: () => 'module2', api: {} };

            mockIntegrationRepository.findIntegrationByName.mockResolvedValue(mockRecord);
            mockModuleRepository.findEntitiesByIds.mockResolvedValue(mockEntities);
            mockModuleFactory.getModuleInstance
                .mockResolvedValueOnce(mockModule1)
                .mockResolvedValueOnce(mockModule2);

            const req = { headers: {} };
            const res = { json: jest.fn() };
            const next = jest.fn();

            const result = await dispatcher.dispatchHttp({
                integrationClass: TestIntegration,
                event: 'LOAD_DATA',
                req,
                res,
                next
            });

            expect(result).toEqual({
                success: true,
                data: mockRecord.config,
                integrationId: 'integration-123'
            });

            // Verify all dependencies were called
            expect(mockIntegrationRepository.findIntegrationByName).toHaveBeenCalledWith('test-integration');
            expect(mockModuleRepository.findEntitiesByIds).toHaveBeenCalledWith(['entity-1', 'entity-2']);
            expect(mockModuleFactory.getModuleInstance).toHaveBeenCalledTimes(2);
        });

        it('should call initialize and load dynamic events', async () => {
            mockIntegrationRepository.findIntegrationByName.mockResolvedValue(null);

            const req = { headers: {} };
            const res = { json: jest.fn() };
            const next = jest.fn();

            const result = await dispatcher.dispatchHttp({
                integrationClass: TestIntegration,
                event: 'DYNAMIC_EVENT',
                req,
                res,
                next
            });

            expect(result).toEqual({ dynamic: true });
        });

        it('should throw error if event is not registered', async () => {
            mockIntegrationRepository.findIntegrationByName.mockResolvedValue(null);

            const req = { headers: {} };
            const res = { json: jest.fn() };
            const next = jest.fn();

            await expect(dispatcher.dispatchHttp({
                integrationClass: TestIntegration,
                event: 'UNKNOWN_EVENT',
                req,
                res,
                next
            })).rejects.toThrow('Event UNKNOWN_EVENT not registered for test-integration');
        });

        it('should handle database lookup errors gracefully', async () => {
            // Mock database error
            mockIntegrationRepository.findIntegrationByName.mockRejectedValue(
                new Error('Database connection failed')
            );

            const req = { headers: {} };
            const res = { json: jest.fn() };
            const next = jest.fn();

            // Should still work with stateless instance
            const result = await dispatcher.dispatchHttp({
                integrationClass: TestIntegration,
                event: 'AUTH_REQUEST',
                req,
                res,
                next
            });

            expect(result).toEqual({
                success: true,
                message: 'Auth request handled',
                hasDatabase: false
            });
        });
    });

    describe('dispatchJob', () => {
        it('should handle job with integration context', async () => {
            const mockRecord = {
                id: 'integration-123',
                userId: 'user-456',
                config: { type: 'test' },
                status: 'ENABLED',
                version: '1.0.0',
                messages: { errors: [], warnings: [] },
                entitiesIds: []
            };

            mockIntegrationRepository.findIntegrationByName.mockResolvedValue(mockRecord);
            mockModuleRepository.findEntitiesByIds.mockResolvedValue([]);

            const data = { testData: 'value' };
            const context = { integrationId: 'integration-123' };

            const result = await dispatcher.dispatchJob({
                integrationClass: TestIntegration,
                event: 'TEST_EVENT',
                data,
                context
            });

            expect(result).toEqual({
                success: true,
                received: data
            });
        });

        it('should handle job without integration context', async () => {
            mockIntegrationRepository.findIntegrationByName.mockResolvedValue(null);

            const data = { testData: 'value' };
            const context = {};

            const result = await dispatcher.dispatchJob({
                integrationClass: TestIntegration,
                event: 'TEST_EVENT',
                data,
                context
            });

            expect(result).toEqual({
                success: true,
                received: data
            });
        });

        it('should throw error for unknown job event', async () => {
            mockIntegrationRepository.findIntegrationByName.mockResolvedValue(null);

            const data = {};
            const context = {};

            await expect(dispatcher.dispatchJob({
                integrationClass: TestIntegration,
                event: 'UNKNOWN_JOB',
                data,
                context
            })).rejects.toThrow('Event UNKNOWN_JOB not registered for test-integration');
        });
    });

    describe('findEventHandler', () => {
        it('should find handler in events object', async () => {
            const integration = new TestIntegration({});
            await integration.initialize();

            const handler = dispatcher.findEventHandler(integration, 'AUTH_REQUEST');
            expect(handler).toBeDefined();
            expect(typeof handler).toBe('function');
        });

        it('should find handler in defaultEvents', async () => {
            const integration = new TestIntegration({});

            const handler = dispatcher.findEventHandler(integration, 'ON_CREATE');
            expect(handler).toBeDefined();
            expect(typeof handler).toBe('function');
        });

        it('should return null for non-existent event', async () => {
            const integration = new TestIntegration({});

            const handler = dispatcher.findEventHandler(integration, 'NON_EXISTENT');
            expect(handler).toBeNull();
        });
    });

    describe('resolveIntegration', () => {
        it('should create stateless instance when no database record exists', async () => {
            mockIntegrationRepository.findIntegrationByName.mockResolvedValue(null);

            const integration = await dispatcher.resolveIntegration(TestIntegration);

            expect(integration).toBeInstanceOf(TestIntegration);
            expect(integration.id).toBeUndefined();
            expect(integration.config).toBeUndefined();
        });

        it('should create stateful instance with all properties', async () => {
            const mockRecord = {
                id: 'integration-123',
                userId: 'user-456',
                config: { apiKey: 'secret' },
                status: 'ENABLED',
                version: '1.0.0',
                messages: { errors: [], warnings: [] },
                entitiesIds: ['entity-1']
            };

            const mockEntities = [{ _id: 'entity-1', name: 'module1' }];
            const mockModule = {
                getName: () => 'testModule',
                name: 'testModule',
                api: {}
            };

            mockIntegrationRepository.findIntegrationByName.mockResolvedValue(mockRecord);
            mockModuleRepository.findEntitiesByIds.mockResolvedValue(mockEntities);
            mockModuleFactory.getModuleInstance.mockResolvedValue(mockModule);

            const integration = await dispatcher.resolveIntegration(TestIntegration);

            expect(integration).toBeInstanceOf(TestIntegration);
            expect(integration.id).toBe('integration-123');
            expect(integration.userId).toBe('user-456');
            expect(integration.config).toEqual({ apiKey: 'secret' });
            expect(integration.status).toBe('ENABLED');
            expect(integration.testModule).toBe(mockModule);
        });

        it('should fall back to stateless when module loading fails', async () => {
            const mockRecord = {
                id: 'integration-123',
                userId: 'user-456',
                config: {},
                status: 'ENABLED',
                version: '1.0.0',
                messages: { errors: [], warnings: [] },
                entitiesIds: ['entity-1']
            };

            mockIntegrationRepository.findIntegrationByName.mockResolvedValue(mockRecord);
            mockModuleRepository.findEntitiesByIds.mockResolvedValue([{ _id: 'entity-1' }]);
            mockModuleFactory.getModuleInstance.mockRejectedValue(new Error('Module load failed'));

            // Should fall back to stateless instance
            const integration = await dispatcher.resolveIntegration(TestIntegration);

            expect(integration).toBeInstanceOf(TestIntegration);
            // Should be stateless (no id, config, etc.)
            expect(integration.id).toBeUndefined();
            expect(integration.config).toBeUndefined();
        });
    });
});

// Test for default events from IntegrationBase
describe('IntegrationEventDispatcher with default events', () => {
    let dispatcher;

    beforeEach(() => {
        jest.clearAllMocks();
        dispatcher = new IntegrationEventDispatcher({
            integrationRepository: mockIntegrationRepository,
            moduleFactory: mockModuleFactory,
            moduleRepository: mockModuleRepository
        });
    });

    it('should handle default ON_CREATE event', async () => {
        const mockRecord = {
            id: 'integration-123',
            userId: 'user-456',
            config: {},
            status: 'ENABLED',
            version: '1.0.0',
            messages: { errors: [], warnings: [] },
            entitiesIds: []
        };

        mockIntegrationRepository.findIntegrationByName.mockResolvedValue(mockRecord);
        mockModuleRepository.findEntitiesByIds.mockResolvedValue([]);

        // Mock the updateIntegrationStatus to avoid actual DB calls
        const integration = new TestIntegration({
            id: mockRecord.id,
            userId: mockRecord.userId,
            config: mockRecord.config,
            status: mockRecord.status
        });
        integration.updateIntegrationStatus = {
            execute: jest.fn().mockResolvedValue(true)
        };

        const req = {};
        const res = {};
        const next = jest.fn();

        // The dispatcher should be able to find and call ON_CREATE
        const handler = dispatcher.findEventHandler(integration, 'ON_CREATE');
        expect(handler).toBeDefined();

        // Call the handler
        const result = await handler.call(integration, { integrationId: 'integration-123' });

        // ON_CREATE should update status to ENABLED
        expect(integration.updateIntegrationStatus.execute).toHaveBeenCalledWith('integration-123', 'ENABLED');
    });
});