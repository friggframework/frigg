const { LoadIntegrationContextUseCase } = require('./load-integration-context');
const { IntegrationBase } = require('../integration-base');
const { createIntegrationRepository } = require('../integration-repository-factory');
const { Module } = require('../../modules/module');
const { ModuleFactory } = require('../../modules/module-factory');
const { ModuleRepository } = require('../../modules/module-repository');

// Mock OAuth2 API class that extends requester pattern
class MockAsanaApi {
    constructor(params) {
        // Capture all injected params
        this.client_id = params.client_id;
        this.client_secret = params.client_secret;
        this.redirect_uri = params.redirect_uri;
        this.scope = params.scope;
        this.access_token = params.access_token;
        this.refresh_token = params.refresh_token;
        this.delegate = params.delegate;
    }

    async getFolders() {
        if (!this.access_token) {
            throw new Error('No access token');
        }
        return {
            folders: ['Marketing', 'Development', 'Design'],
            usedToken: this.access_token
        };
    }

    async listProjects() {
        return {
            projects: ['Q1 Launch', 'Website Redesign'],
            clientId: this.client_id
        };
    }

    getAuthorizationRequirements() {
        return { type: 'oauth2', url: this.redirect_uri };
    }
}

MockAsanaApi.requesterType = 'oauth2';

class MockFrontifyApi {
    constructor(params) {
        this.client_id = params.client_id;
        this.client_secret = params.client_secret;
        this.redirect_uri = params.redirect_uri;
        this.scope = params.scope;
        this.access_token = params.access_token;
        this.refresh_token = params.refresh_token;
        this.domain = params.domain;
    }

    async listBrands() {
        return {
            brands: ['Main Brand', 'Sub Brand'],
            domain: this.domain,
            token: this.access_token
        };
    }

    async searchAssets(query) {
        return {
            query,
            assets: ['logo.svg', 'guidelines.pdf'],
            clientSecret: this.client_secret ? 'hidden' : null
        };
    }

    getAuthorizationRequirements() {
        return { type: 'oauth2', url: this.redirect_uri };
    }
}

MockFrontifyApi.requesterType = 'oauth2';

// Module definitions with env variables
const asanaDefinition = {
    moduleName: 'asana',
    modelName: 'Asana',
    API: MockAsanaApi,
    requiredAuthMethods: {
        getToken: async () => {},
        getEntityDetails: async () => {},
        getCredentialDetails: async () => {},
        apiPropertiesToPersist: {
            credential: ['access_token', 'refresh_token'],
            entity: [],
        },
        testAuthRequest: async () => true,
    },
    env: {
        client_id: 'ASANA_CLIENT_ID_FROM_ENV',
        client_secret: 'ASANA_SECRET_FROM_ENV',
        redirect_uri: 'https://app.example.com/auth/asana',
        scope: 'default',
    },
};

const frontifyDefinition = {
    moduleName: 'frontify',
    modelName: 'Frontify',
    API: MockFrontifyApi,
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
        client_id: 'FRONTIFY_CLIENT_ID_FROM_ENV',
        client_secret: 'FRONTIFY_SECRET_FROM_ENV',
        redirect_uri: 'https://app.example.com/auth/frontify',
        scope: 'read write',
    },
};

// Integration class similar to AsanaIntegration
class TestIntegration extends IntegrationBase {
    static Definition = {
        name: 'test-integration',
        version: '1.0.0',
        modules: {
            asana: {
                definition: asanaDefinition,
            },
            frontify: {
                definition: frontifyDefinition,
            },
        },
    };

    async performBusinessLogic() {
        // After hydration, this method can use API modules
        const folders = await this.asana.api.getFolders();
        const brands = await this.frontify.api.listBrands();
        return { folders, brands };
    }
}

describe('LoadIntegrationContextUseCase - Full Rounded Test', () => {
    it('should load integration with working API modules that have env vars and credentials', async () => {
        // Setup: Create entities with credentials (simulating DB records)
        const entities = [
            {
                id: 'entity-asana-123',
                moduleName: 'asana',
                userId: 'user-789',
                credential: {
                    access_token: 'asana_access_token_xyz',
                    refresh_token: 'asana_refresh_token_abc',
                },
            },
            {
                id: 'entity-frontify-456',
                moduleName: 'frontify',
                userId: 'user-789',
                domain: 'customer.frontify.com',
                credential: {
                    access_token: 'frontify_access_token_uvw',
                    refresh_token: 'frontify_refresh_token_def',
                },
            },
        ];

        // Mock repositories
        const moduleRepository = {
            findEntitiesByIds: jest.fn().mockResolvedValue(entities),
            findEntityById: jest.fn().mockImplementation((id) =>
                Promise.resolve(entities.find(e => e.id === id))
            ),
        };

        // Create module factory with definitions
        const moduleFactory = new ModuleFactory({
            moduleRepository,
            moduleDefinitions: [asanaDefinition, frontifyDefinition],
        });

        // Create the use case
        const useCase = new LoadIntegrationContextUseCase({
            integrationRepository: createIntegrationRepository(),
            moduleRepository,
            moduleFactory,
        });

        // Execute: Load integration context
        const integrationRecord = {
            id: 'integration-999',
            userId: 'user-789',
            entitiesIds: ['entity-asana-123', 'entity-frontify-456'],
            status: 'active',
            config: { someConfig: true },
        };

        const context = await useCase.execute({ integrationRecord });

        // Verify: Context has modules
        expect(context.modules).toHaveLength(2);

        // Create integration instance and hydrate it
        const integration = new TestIntegration();
        integration.setIntegrationRecord(context);

        // Verify: Integration has modules attached
        expect(integration.asana).toBeDefined();
        expect(integration.frontify).toBeDefined();
        expect(integration.modules.asana).toBe(integration.asana);
        expect(integration.modules.frontify).toBe(integration.frontify);

        // CRITICAL TEST: Verify API instances have env vars from definition
        expect(integration.asana.api.client_id).toBe('ASANA_CLIENT_ID_FROM_ENV');
        expect(integration.asana.api.client_secret).toBe('ASANA_SECRET_FROM_ENV');
        expect(integration.asana.api.redirect_uri).toBe('https://app.example.com/auth/asana');
        expect(integration.asana.api.scope).toBe('default');

        expect(integration.frontify.api.client_id).toBe('FRONTIFY_CLIENT_ID_FROM_ENV');
        expect(integration.frontify.api.client_secret).toBe('FRONTIFY_SECRET_FROM_ENV');
        expect(integration.frontify.api.redirect_uri).toBe('https://app.example.com/auth/frontify');
        expect(integration.frontify.api.scope).toBe('read write');

        // CRITICAL TEST: Verify API instances have credentials from entities
        expect(integration.asana.api.access_token).toBe('asana_access_token_xyz');
        expect(integration.asana.api.refresh_token).toBe('asana_refresh_token_abc');

        expect(integration.frontify.api.access_token).toBe('frontify_access_token_uvw');
        expect(integration.frontify.api.refresh_token).toBe('frontify_refresh_token_def');
        expect(integration.frontify.api.domain).toBe('customer.frontify.com');

        // CRITICAL TEST: Can call API methods successfully
        const folders = await integration.asana.api.getFolders();
        expect(folders.folders).toEqual(['Marketing', 'Development', 'Design']);
        expect(folders.usedToken).toBe('asana_access_token_xyz');

        const projects = await integration.asana.api.listProjects();
        expect(projects.projects).toEqual(['Q1 Launch', 'Website Redesign']);
        expect(projects.clientId).toBe('ASANA_CLIENT_ID_FROM_ENV');

        const brands = await integration.frontify.api.listBrands();
        expect(brands.brands).toEqual(['Main Brand', 'Sub Brand']);
        expect(brands.domain).toBe('customer.frontify.com');
        expect(brands.token).toBe('frontify_access_token_uvw');

        const assets = await integration.frontify.api.searchAssets('logo');
        expect(assets.query).toBe('logo');
        expect(assets.assets).toEqual(['logo.svg', 'guidelines.pdf']);
        expect(assets.clientSecret).toBe('hidden'); // Verifies secret exists

        // CRITICAL TEST: Business logic methods can use hydrated APIs
        const businessResult = await integration.performBusinessLogic();
        expect(businessResult.folders.folders).toEqual(['Marketing', 'Development', 'Design']);
        expect(businessResult.brands.brands).toEqual(['Main Brand', 'Sub Brand']);

        // Verify the complete chain: env → Module → API → Integration
        console.log('\n✅ Full Integration Test Results:');
        console.log('  ENV vars injected: ✓');
        console.log('  Credentials injected: ✓');
        console.log('  API methods callable: ✓');
        console.log('  Business logic works: ✓');
    });

    it('should handle missing credentials gracefully', async () => {
        // Entity without credentials
        const entities = [
            {
                id: 'entity-no-creds',
                moduleName: 'asana',
                userId: 'user-123',
                // No credential property
            },
        ];

        const moduleRepository = {
            findEntitiesByIds: jest.fn().mockResolvedValue(entities),
            findEntityById: jest.fn().mockResolvedValue(entities[0]),
        };

        const moduleFactory = new ModuleFactory({
            moduleRepository,
            moduleDefinitions: [asanaDefinition],
        });

        const useCase = new LoadIntegrationContextUseCase({
            integrationRepository: createIntegrationRepository(),
            moduleRepository,
            moduleFactory,
        });

        const context = await useCase.execute({
            integrationRecord: {
                id: 'integration-1',
                userId: 'user-123',
                entitiesIds: ['entity-no-creds'],
            },
        });

        const integration = new TestIntegration();
        integration.setIntegrationRecord(context);

        // Should have module with env vars but no credentials
        expect(integration.asana).toBeDefined();
        expect(integration.asana.api.client_id).toBe('ASANA_CLIENT_ID_FROM_ENV');
        expect(integration.asana.api.access_token).toBeUndefined();

        // API method should fail without token
        await expect(integration.asana.api.getFolders()).rejects.toThrow('No access token');
    });
});