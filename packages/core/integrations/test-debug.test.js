const request = require('supertest');
const express = require('express');

// Mock dependencies first
jest.mock('../handlers/app-definition-loader');
jest.mock('./repositories/integration-repository-factory');
jest.mock('../credential/repositories/credential-repository-factory');
jest.mock('../user/repositories/user-repository-factory');
jest.mock('../modules/repositories/authorization-session-repository-factory');
jest.mock('../modules/repositories/module-repository-factory');

const { createIntegrationRouter } = require('./integration-router');
const { loadAppDefinition } = require('../handlers/app-definition-loader');
const {
    createUserRepository,
} = require('../user/repositories/user-repository-factory');
const {
    createAuthorizationSessionRepository,
} = require('../modules/repositories/authorization-session-repository-factory');
const {
    createModuleRepository,
} = require('../modules/repositories/module-repository-factory');
const {
    createCredentialRepository,
} = require('../credential/repositories/credential-repository-factory');
const {
    createIntegrationRepository,
} = require('./repositories/integration-repository-factory');

describe('Debug Test', () => {
    let app;

    beforeEach(() => {
        // Mock user
        const mockUser = {
            getId: jest.fn().mockReturnValue('user-123'),
            id: 'user-123',
        };

        // Mock user repository with all required methods
        const mockUserRepository = {
            findById: jest.fn().mockResolvedValue(mockUser),
            findByToken: jest.fn().mockResolvedValue(mockUser),
            getSessionToken: jest.fn().mockResolvedValue(mockUser),
            findIndividualUserById: jest.fn().mockResolvedValue(mockUser),
            findByIndividualUserId: jest.fn().mockResolvedValue(mockUser),
            findOrganizationUserById: jest.fn().mockResolvedValue(mockUser),
        };

        // Mock module definitions
        const mockModuleDefinitions = [
            {
                moduleName: 'hubspot',
                definition: {
                    getDisplayName: () => 'HubSpot',
                    getDescription: () => 'Connect to HubSpot CRM',
                    getAuthType: () => 'oauth2',
                    getAuthStepCount: () => 1,
                    getCapabilities: () => ['contacts', 'companies'],
                },
                apiClass: jest.fn(),
            },
        ];

        // Mock loadAppDefinition
        loadAppDefinition.mockReturnValue({
            integrations: mockModuleDefinitions,
            userConfig: {
                usePassword: true,
                primary: 'individual',
            },
        });

        createUserRepository.mockReturnValue(mockUserRepository);
        createAuthorizationSessionRepository.mockReturnValue({
            findBySessionId: jest.fn(),
            create: jest.fn(),
            update: jest.fn(),
        });
        createModuleRepository.mockReturnValue({
            findById: jest.fn(),
            findByUserId: jest.fn(),
            findByUserIdAndType: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
        });
        createCredentialRepository.mockReturnValue({
            findById: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
        });
        createIntegrationRepository.mockReturnValue({
            findById: jest.fn(),
            findByUserId: jest.fn(),
            save: jest.fn(),
        });

        // Create app
        app = express();
        app.use(express.json());
        const router = createIntegrationRouter();
        app.use('/', router);
    });

    it('should return entity types', async () => {
        const response = await request(app)
            .get('/api/entities/types')
            .set('Authorization', 'Bearer valid-token');

        console.log('Status:', response.status);
        console.log('Body:', JSON.stringify(response.body, null, 2));
        console.log('Text:', response.text);
        console.log('Error:', response.error);

        if (response.status !== 200) {
            // Try to get the route list
            console.log(
                'Router stack:',
                app._router?.stack?.map((layer) => ({
                    name: layer.name,
                    path: layer.regexp?.toString(),
                    route: layer.route?.path,
                }))
            );
        }

        expect(response.status).toBe(200);
    });
});
