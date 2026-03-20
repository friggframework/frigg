jest.mock('../database/config', () => ({
    DB_TYPE: 'mongodb',
    getDatabaseType: jest.fn(() => 'mongodb'),
    PRISMA_LOG_LEVEL: 'error,warn',
    PRISMA_QUERY_LOGGING: false,
}));

import { Module } from './module';
import { ModuleFactory } from './module-factory';

class MockOAuth2Api {
    client_id: string;
    client_secret: string;
    redirect_uri: string;
    scope: string;
    access_token: string;
    refresh_token: string;
    domain: string;
    delegate: any;
    static requesterType = 'oauth2';

    constructor(params: any) {
        this.client_id = params.client_id;
        this.client_secret = params.client_secret;
        this.redirect_uri = params.redirect_uri;
        this.scope = params.scope;
        this.access_token = params.access_token;
        this.refresh_token = params.refresh_token;
        this.domain = params.domain;
        this.delegate = params.delegate;
    }

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
                    data: {
                        access_token: 'test_access_token',
                        refresh_token: 'test_refresh_token',
                    },
                },
            };

            const module = new Module({
                definition: mockModuleDefinition as any,
                userId: 'user-1',
                entity,
            });

            expect(module.name).toBe('testmodule');
            expect(module.api).toBeDefined();

            expect((module.api as any).client_id).toBe('test_client_id');
            expect((module.api as any).client_secret).toBe('test_client_secret');
            expect((module.api as any).redirect_uri).toBe('https://test.com/redirect');
            expect((module.api as any).scope).toBe('read write');
            expect((module.api as any).access_token).toBe('test_access_token');
            expect((module.api as any).refresh_token).toBe('test_refresh_token');
            expect((module.api as any).domain).toBe('test.domain.com');
        });

        it('should allow API methods to be called with credentials', async () => {
            const entity = {
                id: 'entity-1',
                moduleName: 'testmodule',
                credential: {
                    data: {
                        access_token: 'valid_token',
                        refresh_token: 'valid_refresh_token',
                    },
                },
            };

            const module = new Module({
                definition: mockModuleDefinition as any,
                userId: 'user-1',
                entity,
            });

            const projects = await (module.api as any).listProjects();
            expect(projects).toEqual({ projects: ['project1', 'project2'] });

            const folders = await (module.api as any).getFolders();
            expect(folders).toEqual({ folders: ['folder1', 'folder2'] });
        });

        it('should handle missing credentials gracefully', () => {
            const entity = {
                id: 'entity-1',
                moduleName: 'testmodule',
                credential: {
                    data: {},
                },
            };

            const module = new Module({
                definition: mockModuleDefinition as any,
                userId: 'user-1',
                entity,
            });

            expect(module.api).toBeDefined();
            expect((module.api as any).client_id).toBe('test_client_id');
            expect((module.api as any).access_token).toBeUndefined();
        });
    });

    describe('ModuleFactory', () => {
        it('should create module instance from entity and definition', async () => {
            const entity = {
                id: 'entity-1',
                moduleName: 'testmodule',
                userId: 'user-1',
                credential: {
                    data: {
                        access_token: 'factory_token',
                    },
                },
            };

            const moduleRepository = {
                findEntityById: jest.fn().mockResolvedValue(entity),
            };

            const factory = new ModuleFactory({
                moduleRepository: moduleRepository as any,
                moduleDefinitions: [mockModuleDefinition] as any,
            });

            const module = await factory.getModuleInstance('entity-1', 'user-1');

            expect(module).toBeDefined();
            expect(module.api).toBeDefined();
            expect((module.api as any).access_token).toBe('factory_token');
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
                moduleRepository: moduleRepository as any,
                moduleDefinitions: [mockModuleDefinition] as any,
            });

            await expect(
                factory.getModuleInstance('entity-1', 'user-1')
            ).rejects.toThrow('Module definition not found for module: unknownmodule');
        });
    });
});
