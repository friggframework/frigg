const bootstrap = require('../bootstrap');

describe('db-credentials bootstrap', () => {
    let mockPrisma;

    beforeEach(() => {
        mockPrisma = {
            oAuthAppCredential: {
                findUnique: jest.fn(),
            },
        };
    });

    it('should be a function', () => {
        expect(typeof bootstrap).toBe('function');
    });

    it('should do nothing when no integrations', async () => {
        await bootstrap(mockPrisma, {});
        await bootstrap(mockPrisma, { integrations: [] });
        await bootstrap(mockPrisma, null);
        // No errors thrown
    });

    it('should replace definition.env with async function', async () => {
        const moduleDefinition = {
            moduleName: 'hubspot',
            API: class {},
            env: { client_id: 'static-id', client_secret: 'static-secret' },
            requiredAuthMethods: {},
        };

        class TestIntegration {
            static Definition = {
                name: 'test',
                modules: { hubspot: moduleDefinition },
            };
        }

        const appDefinition = {
            integrations: [TestIntegration],
        };

        await bootstrap(mockPrisma, appDefinition);

        // env should now be a function
        expect(typeof moduleDefinition.env).toBe('function');
    });

    it('should return DB credentials when record exists', async () => {
        const moduleDefinition = {
            moduleName: 'hubspot',
            API: class {},
            env: { client_id: 'static-id', client_secret: 'static-secret', scope: 'contacts' },
            requiredAuthMethods: {},
        };

        class TestIntegration {
            static Definition = {
                name: 'test',
                modules: { hubspot: moduleDefinition },
            };
        }

        mockPrisma.oAuthAppCredential.findUnique.mockResolvedValue({
            moduleName: 'hubspot',
            clientId: 'db-client-id',
            clientSecret: 'db-client-secret',
            extra: { scope: 'contacts crm' },
        });

        await bootstrap(mockPrisma, { integrations: [TestIntegration] });

        const result = await moduleDefinition.env();

        expect(mockPrisma.oAuthAppCredential.findUnique).toHaveBeenCalledWith({
            where: { moduleName: 'hubspot' },
        });
        expect(result.client_id).toBe('db-client-id');
        expect(result.client_secret).toBe('db-client-secret');
        expect(result.scope).toBe('contacts crm'); // extra overrides static
    });

    it('should fall back to original static env when no DB record', async () => {
        const moduleDefinition = {
            moduleName: 'hubspot',
            API: class {},
            env: { client_id: 'env-id', client_secret: 'env-secret' },
            requiredAuthMethods: {},
        };

        class TestIntegration {
            static Definition = {
                name: 'test',
                modules: { hubspot: moduleDefinition },
            };
        }

        mockPrisma.oAuthAppCredential.findUnique.mockResolvedValue(null);

        await bootstrap(mockPrisma, { integrations: [TestIntegration] });

        const result = await moduleDefinition.env();
        expect(result.client_id).toBe('env-id');
        expect(result.client_secret).toBe('env-secret');
    });

    it('should fall back gracefully when DB query fails', async () => {
        const moduleDefinition = {
            moduleName: 'hubspot',
            API: class {},
            env: { client_id: 'env-id', client_secret: 'env-secret' },
            requiredAuthMethods: {},
        };

        class TestIntegration {
            static Definition = {
                name: 'test',
                modules: { hubspot: moduleDefinition },
            };
        }

        mockPrisma.oAuthAppCredential.findUnique.mockRejectedValue(
            new Error('Table does not exist')
        );

        await bootstrap(mockPrisma, { integrations: [TestIntegration] });

        const result = await moduleDefinition.env();
        expect(result.client_id).toBe('env-id');
        expect(result.client_secret).toBe('env-secret');
    });

    it('should work when original env is already a function', async () => {
        const moduleDefinition = {
            moduleName: 'hubspot',
            API: class {},
            env: async () => ({ client_id: 'fn-id', client_secret: 'fn-secret', scope: 'all' }),
            requiredAuthMethods: {},
        };

        class TestIntegration {
            static Definition = {
                name: 'test',
                modules: { hubspot: moduleDefinition },
            };
        }

        mockPrisma.oAuthAppCredential.findUnique.mockResolvedValue({
            moduleName: 'hubspot',
            clientId: 'db-id',
            clientSecret: 'db-secret',
            extra: {},
        });

        await bootstrap(mockPrisma, { integrations: [TestIntegration] });

        const result = await moduleDefinition.env();
        expect(result.client_id).toBe('db-id');
        expect(result.client_secret).toBe('db-secret');
        expect(result.scope).toBe('all'); // preserved from original fn
    });

    it('should skip modules without moduleName', async () => {
        const moduleDefinition = {
            API: class {},
            env: { client_id: 'original' },
        };

        class TestIntegration {
            static Definition = {
                name: 'test',
                modules: { broken: moduleDefinition },
            };
        }

        await bootstrap(mockPrisma, { integrations: [TestIntegration] });

        // env should NOT have been replaced
        expect(typeof moduleDefinition.env).toBe('object');
        expect(moduleDefinition.env.client_id).toBe('original');
    });
});
