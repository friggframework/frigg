//todo: this test can probably be removed later

/**
 * Integration test to verify that the auth flow works without requiring a database record
 * This test simulates the actual problem we're solving.
 */

const {
    IntegrationEventDispatcher,
} = require('./integration-event-dispatcher');
const { IntegrationBase } = require('../integrations/integration-base');

// Simulate AsanaIntegration-like class
class SimulatedAsanaIntegration extends IntegrationBase {
    static Definition = {
        name: 'asana',
        version: '1.0.0',
        modules: {
            asana: { definition: { name: 'asana' } },
            frontify: { definition: { name: 'frontify' } },
        },
        routes: [
            { path: '/auth', method: 'GET', event: 'AUTH_REQUEST' },
            {
                path: '/auth/redirect/:provider',
                method: 'GET',
                event: 'AUTH_REDIRECT',
            },
            { path: '/fetch-form', method: 'GET', event: 'LOAD_FORM' },
        ],
    };

    constructor(params) {
        super(params);

        // Define events like AsanaIntegration does
        this.events = {
            AUTH_REQUEST: {
                handler: this.authRequest.bind(this),
            },
            AUTH_REDIRECT: {
                handler: this.authRedirect.bind(this),
            },
            LOAD_FORM: {
                handler: this.loadForm.bind(this),
            },
        };
    }

    async authRequest({ req, res }) {
        // This should work WITHOUT any database record
        // Simulating OAuth flow initiation
        const provider = req.params?.provider || 'asana';

        return {
            success: true,
            action: 'redirect',
            url: `https://app.asana.com/oauth/authorize?client_id=test&redirect_uri=test`,
            provider: provider,
            message: 'Auth initiated without database record!',
        };
    }

    async authRedirect({ req, res }) {
        // Handle OAuth callback
        const code = req.query?.code;

        if (!code) {
            throw new Error('No authorization code provided');
        }

        // In real implementation, would exchange code for tokens
        // and create database record here
        return {
            success: true,
            action: 'tokens_received',
            message: 'Would create integration record here',
        };
    }

    async loadForm({ req, res }) {
        // This SHOULD require database record
        if (!this.id) {
            throw new Error('Integration not found - must authenticate first');
        }

        return {
            success: true,
            form: {
                fields: ['field1', 'field2'],
            },
            integrationId: this.id,
        };
    }
}

describe('Auth Flow Integration Test', () => {
    let dispatcher;
    let mockIntegrationRepository;
    let mockModuleRepository;
    let mockModuleFactory;

    beforeEach(() => {
        // Create mocks
        mockIntegrationRepository = {
            findIntegrationByName: jest.fn(),
        };

        mockModuleRepository = {
            findEntitiesByIds: jest.fn(),
        };

        mockModuleFactory = {
            getModuleInstance: jest.fn(),
        };

        // Create dispatcher
        dispatcher = new IntegrationEventDispatcher({
            integrationRepository: mockIntegrationRepository,
            moduleFactory: mockModuleFactory,
            moduleRepository: mockModuleRepository,
        });
    });

    describe('First-time authentication (no database record)', () => {
        it('should handle AUTH_REQUEST without database record', async () => {
            // Simulate: No integration exists in database yet
            mockIntegrationRepository.findIntegrationByName.mockResolvedValue(
                null
            );

            const req = { params: { provider: 'asana' }, query: {} };
            const res = { json: jest.fn(), redirect: jest.fn() };
            const next = jest.fn();

            // This is the key test - auth should work WITHOUT database record
            const result = await dispatcher.dispatchHttp({
                integrationClass: SimulatedAsanaIntegration,
                event: 'AUTH_REQUEST',
                req,
                res,
                next,
            });

            expect(result).toMatchObject({
                success: true,
                action: 'redirect',
                message: 'Auth initiated without database record!',
            });

            // Verify we tried to look up the integration
            expect(
                mockIntegrationRepository.findIntegrationByName
            ).toHaveBeenCalledWith('asana');

            // Verify we didn't try to load modules (stateless)
            expect(mockModuleFactory.getModuleInstance).not.toHaveBeenCalled();
        });

        it('should handle AUTH_REDIRECT without database record', async () => {
            // Still no database record during OAuth callback
            mockIntegrationRepository.findIntegrationByName.mockResolvedValue(
                null
            );

            const req = {
                params: { provider: 'asana' },
                query: { code: 'auth_code_123' },
            };
            const res = { json: jest.fn() };
            const next = jest.fn();

            const result = await dispatcher.dispatchHttp({
                integrationClass: SimulatedAsanaIntegration,
                event: 'AUTH_REDIRECT',
                req,
                res,
                next,
            });

            expect(result).toMatchObject({
                success: true,
                action: 'tokens_received',
                message: 'Would create integration record here',
            });
        });

        it('should fail LOAD_FORM without database record', async () => {
            // No database record means not authenticated
            mockIntegrationRepository.findIntegrationByName.mockResolvedValue(
                null
            );

            const req = { query: {} };
            const res = { json: jest.fn() };
            const next = jest.fn();

            // This should fail because loadForm requires database state
            await expect(
                dispatcher.dispatchHttp({
                    integrationClass: SimulatedAsanaIntegration,
                    event: 'LOAD_FORM',
                    req,
                    res,
                    next,
                })
            ).rejects.toThrow(
                'Integration not found - must authenticate first'
            );
        });
    });

    describe('Authenticated user (with database record)', () => {
        it('should handle LOAD_FORM with database record', async () => {
            // Simulate existing integration in database
            const mockRecord = {
                id: 'integration-abc-123',
                userId: 'user-456',
                config: {
                    type: 'asana',
                    asanaWorkspaceId: 'workspace-789',
                },
                status: 'ENABLED',
                version: '1.0.0',
                messages: { errors: [], warnings: [] },
                entitiesIds: ['entity-asana', 'entity-frontify'],
            };

            const mockEntities = [
                { _id: 'entity-asana', name: 'asana' },
                { _id: 'entity-frontify', name: 'frontify' },
            ];

            const mockAsanaModule = {
                getName: () => 'asana',
                api: { getUser: jest.fn() },
            };

            const mockFrontifyModule = {
                getName: () => 'frontify',
                api: { getProjects: jest.fn() },
            };

            mockIntegrationRepository.findIntegrationByName.mockResolvedValue(
                mockRecord
            );
            mockModuleRepository.findEntitiesByIds.mockResolvedValue(
                mockEntities
            );
            mockModuleFactory.getModuleInstance
                .mockResolvedValueOnce(mockAsanaModule)
                .mockResolvedValueOnce(mockFrontifyModule);

            const req = { query: {} };
            const res = { json: jest.fn() };
            const next = jest.fn();

            const result = await dispatcher.dispatchHttp({
                integrationClass: SimulatedAsanaIntegration,
                event: 'LOAD_FORM',
                req,
                res,
                next,
            });

            expect(result).toMatchObject({
                success: true,
                form: {
                    fields: expect.any(Array),
                },
                integrationId: 'integration-abc-123',
            });

            // Verify modules were loaded
            expect(mockModuleFactory.getModuleInstance).toHaveBeenCalledTimes(
                2
            );
        });
    });

    describe('Error scenarios', () => {
        it('should gracefully handle database connection errors during auth', async () => {
            // Database is down but auth should still work
            mockIntegrationRepository.findIntegrationByName.mockRejectedValue(
                new Error('MongoDB connection failed')
            );

            const req = { params: { provider: 'asana' }, query: {} };
            const res = { json: jest.fn() };
            const next = jest.fn();

            // Should still work with stateless instance
            const result = await dispatcher.dispatchHttp({
                integrationClass: SimulatedAsanaIntegration,
                event: 'AUTH_REQUEST',
                req,
                res,
                next,
            });

            expect(result).toMatchObject({
                success: true,
                action: 'redirect',
                message: 'Auth initiated without database record!',
            });
        });

        it('should handle missing event gracefully', async () => {
            mockIntegrationRepository.findIntegrationByName.mockResolvedValue(
                null
            );

            const req = {};
            const res = { json: jest.fn() };
            const next = jest.fn();

            await expect(
                dispatcher.dispatchHttp({
                    integrationClass: SimulatedAsanaIntegration,
                    event: 'UNKNOWN_EVENT',
                    req,
                    res,
                    next,
                })
            ).rejects.toThrow('Event UNKNOWN_EVENT not registered for asana');
        });
    });
});

describe('Real-world scenario simulation', () => {
    it('should handle complete auth flow from start to finish', async () => {
        const mockIntegrationRepository = {
            findIntegrationByName: jest.fn(),
            createIntegration: jest.fn(),
        };

        const mockModuleRepository = {
            findEntitiesByIds: jest.fn(),
        };

        const mockModuleFactory = {
            getModuleInstance: jest.fn(),
        };

        const dispatcher = new IntegrationEventDispatcher({
            integrationRepository: mockIntegrationRepository,
            moduleFactory: mockModuleFactory,
            moduleRepository: mockModuleRepository,
        });

        // Step 1: User initiates auth - no DB record exists
        mockIntegrationRepository.findIntegrationByName.mockResolvedValue(null);

        const authReq = { params: { provider: 'asana' } };
        const authRes = { json: jest.fn() };
        const authNext = jest.fn();

        const step1 = await dispatcher.dispatchHttp({
            integrationClass: SimulatedAsanaIntegration,
            event: 'AUTH_REQUEST',
            req: authReq,
            res: authRes,
            next: authNext,
        });

        expect(step1.success).toBe(true);
        expect(step1.action).toBe('redirect');

        // Step 2: OAuth callback - still no DB record
        const callbackReq = {
            params: { provider: 'asana' },
            query: { code: 'oauth_code_xyz' },
        };
        const callbackRes = { json: jest.fn() };
        const callbackNext = jest.fn();

        const step2 = await dispatcher.dispatchHttp({
            integrationClass: SimulatedAsanaIntegration,
            event: 'AUTH_REDIRECT',
            req: callbackReq,
            res: callbackRes,
            next: callbackNext,
        });

        expect(step2.success).toBe(true);
        expect(step2.message).toBe('Would create integration record here');

        // In real implementation, the AUTH_REDIRECT handler would create the DB record
        // Let's simulate that it was created

        // Step 3: Now user can access protected routes with DB record
        const mockRecord = {
            id: 'new-integration-123',
            userId: 'user-456',
            config: { type: 'asana' },
            status: 'ENABLED',
            version: '1.0.0',
            messages: { errors: [], warnings: [] },
            entitiesIds: [],
        };

        mockIntegrationRepository.findIntegrationByName.mockResolvedValue(
            mockRecord
        );
        mockModuleRepository.findEntitiesByIds.mockResolvedValue([]);

        const formReq = { query: {} };
        const formRes = { json: jest.fn() };
        const formNext = jest.fn();

        const step3 = await dispatcher.dispatchHttp({
            integrationClass: SimulatedAsanaIntegration,
            event: 'LOAD_FORM',
            req: formReq,
            res: formRes,
            next: formNext,
        });

        expect(step3.success).toBe(true);
        expect(step3.integrationId).toBe('new-integration-123');

        // Verify the progression from stateless to stateful
        expect(
            mockIntegrationRepository.findIntegrationByName
        ).toHaveBeenCalledTimes(3);
    });
});
