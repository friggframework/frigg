const { Module } = require('./module');
const { ModuleFactory } = require('./module-factory');

// Mock OAuth2Requester base class
class MockOAuth2Api {
    constructor(params) {
        // Capture all params passed to API constructor
        this.client_id = params.client_id;
        this.client_secret = params.client_secret;
        this.redirect_uri = params.redirect_uri;
        this.scope = params.scope;
        this.access_token = params.access_token;
        this.refresh_token = params.refresh_token;
        this.domain = params.domain;
        this.delegate = params.delegate;
    }

    // Mock API methods
    async listProjects() {
        if (!this.access_token) {
            throw new Error('No access token provided');
        }
        return { projects: ['project1', 'project2'] };
    }

    async getFolders() {
        if (!this.access_token) {
            throw new Error('No access token provided');
        }
        return { folders: ['folder1', 'folder2'] };
    }

    getAuthorizationRequirements() {
        return { type: 'oauth2', url: 'https://example.com/oauth' };
    }
}

MockOAuth2Api.requesterType = 'oauth2';

// Mock module definition
const mockModuleDefinition = {
    moduleName: 'testmodule',
    modelName: 'TestModule',
    API: MockOAuth2Api,
    requiredAuthMethods: {
        getToken: async () => {},
        getEntityDetails: async () => {},
        getCredentialDetails: async () => {},
        apiPropertiesToPersist: {
            credential: ['access_token', 'refresh_token'],
            entity: ['domain'],
        },
        testAuthRequest: async () => true,
    },
    env: {
        client_id: 'test_client_id',
        client_secret: 'test_client_secret',
        redirect_uri: 'https://test.com/redirect',
        scope: 'read write',
    },
};

describe('Module Hydration', () => {
    describe('Module API instantiation', () => {
        it('should create API instance with merged env and credential params', () => {
            const entity = {
                id: 'entity-1',
                moduleName: 'testmodule',
                domain: 'test.domain.com',
                credential: {
                    access_token: 'test_access_token',
                    refresh_token: 'test_refresh_token',
                },
            };

            const module = new Module({
                definition: mockModuleDefinition,
                userId: 'user-1',
                entity,
            });

            // Verify module properties
            expect(module.name).toBe('testmodule');
            expect(module.api).toBeDefined();

            // Verify API was instantiated with correct params
            expect(module.api.client_id).toBe('test_client_id');
            expect(module.api.client_secret).toBe('test_client_secret');
            expect(module.api.redirect_uri).toBe('https://test.com/redirect');
            expect(module.api.scope).toBe('read write');
            expect(module.api.access_token).toBe('test_access_token');
            expect(module.api.refresh_token).toBe('test_refresh_token');
            expect(module.api.domain).toBe('test.domain.com');
        });

        it('should allow API methods to be called with credentials', async () => {
            const entity = {
                id: 'entity-1',
                moduleName: 'testmodule',
                credential: {
                    access_token: 'valid_token',
                    refresh_token: 'valid_refresh_token',
                },
            };

            const module = new Module({
                definition: mockModuleDefinition,
                userId: 'user-1',
                entity,
            });

            // Test that API methods work with credentials
            const projects = await module.api.listProjects();
            expect(projects).toEqual({ projects: ['project1', 'project2'] });

            const folders = await module.api.getFolders();
            expect(folders).toEqual({ folders: ['folder1', 'folder2'] });
        });

        it('should handle missing credentials gracefully', () => {
            const entity = {
                id: 'entity-1',
                moduleName: 'testmodule',
                // No credential property
            };

            const module = new Module({
                definition: mockModuleDefinition,
                userId: 'user-1',
                entity,
            });

            // API should still be created with env params only
            expect(module.api).toBeDefined();
            expect(module.api.client_id).toBe('test_client_id');
            expect(module.api.access_token).toBeUndefined();
        });
    });

    describe('ModuleFactory', () => {
        it('should create module instance from entity and definition', async () => {
            const entity = {
                id: 'entity-1',
                moduleName: 'testmodule',
                userId: 'user-1',
                credential: {
                    access_token: 'factory_token',
                },
            };

            const moduleRepository = {
                findEntityById: jest.fn().mockResolvedValue(entity),
            };

            const factory = new ModuleFactory({
                moduleRepository,
                moduleDefinitions: [mockModuleDefinition],
            });

            const module = await factory.getModuleInstance('entity-1', 'user-1');

            expect(module).toBeDefined();
            expect(module.api).toBeDefined();
            expect(module.api.access_token).toBe('factory_token');
        });

        it('should throw error if module definition not found', async () => {
            const entity = {
                id: 'entity-1',
                moduleName: 'unknownmodule',
                userId: 'user-1',
            };

            const moduleRepository = {
                findEntityById: jest.fn().mockResolvedValue(entity),
            };

            const factory = new ModuleFactory({
                moduleRepository,
                moduleDefinitions: [mockModuleDefinition],
            });

            await expect(
                factory.getModuleInstance('entity-1', 'user-1')
            ).rejects.toThrow('Module definition not found for module: unknownmodule');
        });
    });
});