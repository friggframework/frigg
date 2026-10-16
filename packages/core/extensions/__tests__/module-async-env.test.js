const { Module } = require('../../modules/module');

// Create a minimal mock API class
class MockApi {
    constructor(params) {
        this.params = params;
    }

    static get requesterType() {
        return 'api-key';
    }

    getAuthorizationRequirements() {
        return { type: 'api_key' };
    }
}

const mockDefinition = {
    moduleName: 'test-module',
    modelName: 'TestModule',
    API: MockApi,
    requiredAuthMethods: {
        getToken: async () => {},
        getEntityDetails: async () => {},
        getCredentialDetails: async () => {},
        apiPropertiesToPersist: { credential: [], entity: [] },
        testAuthRequest: async () => true,
    },
};

// Mock the repository factories
jest.mock('../../credential/repositories/credential-repository-factory', () => ({
    createCredentialRepository: () => ({}),
}));

jest.mock('../../modules/repositories/module-repository-factory', () => ({
    createModuleRepository: () => ({}),
}));

describe('Module async env support', () => {
    describe('Module.resolveEnv', () => {
        it('should return static env as-is', async () => {
            const env = { client_id: 'abc', client_secret: 'xyz' };
            const result = await Module.resolveEnv({ ...mockDefinition, env });
            expect(result).toEqual(env);
        });

        it('should call and await function env', async () => {
            const env = async () => ({
                client_id: 'from-db',
                client_secret: 'from-db-secret',
            });
            const result = await Module.resolveEnv({ ...mockDefinition, env });
            expect(result).toEqual({
                client_id: 'from-db',
                client_secret: 'from-db-secret',
            });
        });

        it('should handle sync function env', async () => {
            const env = () => ({ client_id: 'sync-fn' });
            const result = await Module.resolveEnv({ ...mockDefinition, env });
            expect(result).toEqual({ client_id: 'sync-fn' });
        });

        it('should return undefined when env is not defined', async () => {
            const result = await Module.resolveEnv(mockDefinition);
            expect(result).toBeUndefined();
        });
    });

    describe('Module.create (async factory)', () => {
        it('should create module with static env', async () => {
            const definition = {
                ...mockDefinition,
                env: { client_id: 'static-id', client_secret: 'static-secret' },
            };

            const module = await Module.create({ definition });
            expect(module.api.params.client_id).toBe('static-id');
            expect(module.api.params.client_secret).toBe('static-secret');
        });

        it('should create module with async function env', async () => {
            const definition = {
                ...mockDefinition,
                env: async () => ({
                    client_id: 'async-id',
                    client_secret: 'async-secret',
                }),
            };

            const module = await Module.create({ definition });
            expect(module.api.params.client_id).toBe('async-id');
            expect(module.api.params.client_secret).toBe('async-secret');
        });

        it('should propagate async env errors', async () => {
            const definition = {
                ...mockDefinition,
                env: async () => {
                    throw new Error('DB unavailable');
                },
            };

            await expect(Module.create({ definition })).rejects.toThrow(
                'DB unavailable'
            );
        });
    });

    describe('backward compatibility', () => {
        it('should still work with new Module() and static env', () => {
            const definition = {
                ...mockDefinition,
                env: { client_id: 'old-style' },
            };

            const module = new Module({ definition });
            expect(module.api.params.client_id).toBe('old-style');
        });
    });
});
