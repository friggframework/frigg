const { ProcessAuthorizationCallback } = require('../../../use-cases/process-authorization-callback');
const { get } = require('../../../../assertions/get');
const { ModuleConstants } = require('../../../ModuleConstants');

describe('ProcessAuthorizationCallback - OAuth Parameter Handling', () => {
  let useCase;
  let mockModuleRepository;
  let mockCredentialRepository;
  let mockApi;
  let MockApiClass;

  beforeEach(() => {
    mockModuleRepository = {
      findEntity: jest.fn(),
      createEntity: jest.fn(),
    };
    mockCredentialRepository = {
      upsertCredential: jest.fn(),
    };

    // Mock API class with static requesterType (mimics OAuth2Requester)
    MockApiClass = class MockOAuth2Api {
      static requesterType = ModuleConstants.authType.oauth2;  // ✅ STATIC property

      constructor(params) {
        this.getTokenFromCode = jest.fn().mockResolvedValue({
          access_token: 'mock_access_token',
          refresh_token: 'mock_refresh_token',
        });
        this.getUserDetails = jest.fn().mockResolvedValue({
          portalId: '12345',
          hub_domain: 'test.hubspot.com',
        });
      }
    };

    mockApi = new MockApiClass();

    useCase = new ProcessAuthorizationCallback({
      moduleRepository: mockModuleRepository,
      credentialRepository: mockCredentialRepository,
      moduleDefinitions: [],
    });
  });

  describe('HubSpot OAuth parameter structure', () => {
    it('should handle HubSpot expecting params.data.code structure', async () => {
      // This is the EXACT structure HubSpot's getToken expects
      const hubspotGetToken = async function (api, params) {
        // HubSpot module does: get(params.data, 'code')
        const code = get(params.data, 'code');
        return api.getTokenFromCode(code);
      };

      const hubspotDefinition = {
        moduleName: 'hubspot',
        API: jest.fn().mockReturnValue(mockApi),
        requiredAuthMethods: {
          getToken: hubspotGetToken,
          getEntityDetails: async (api) => ({
            identifiers: { externalId: '12345', user: 'user123' },
            details: { name: 'Test' },
          }),
          getCredentialDetails: async (api) => ({
            identifiers: { externalId: '12345', user: 'user123' },
            details: {},
          }),
          testAuthRequest: async (api) => true,
          apiPropertiesToPersist: {
            credential: ['access_token', 'refresh_token'],
            entity: [],
          },
        },
        env: {
          client_id: 'test-client-id',
          client_secret: 'test-secret',
          redirect_uri: 'http://localhost:3001/api/oauth/callback',
        },
      };

      useCase.moduleDefinitions = [
        { moduleName: 'hubspot', definition: hubspotDefinition }
      ];

      mockModuleRepository.findEntity.mockResolvedValue(null);
      mockModuleRepository.createEntity.mockResolvedValue({ id: 'entity123' });

      // This is what we receive from HubSpot OAuth callback
      const callbackParams = {
        code: 'na1-2c51-792a-461b-84fd-c73426905b73',
        state: 'e38e71e99d4e9106252629b43f4495b2',
      };

      // This should FAIL with current implementation
      await expect(
        useCase.execute('user123', 'hubspot', callbackParams)
      ).rejects.toThrow('Key "code" is a required parameter');
    });

    it('should work when params are wrapped in data property', async () => {
      const hubspotGetToken = async function (api, params) {
        const code = get(params.data, 'code');
        return api.getTokenFromCode(code);
      };

      const hubspotDefinition = {
        moduleName: 'hubspot',
        API: jest.fn().mockReturnValue(mockApi),
        requiredAuthMethods: {
          getToken: hubspotGetToken,
          getEntityDetails: async (api) => ({
            identifiers: { externalId: '12345', user: 'user123' },
            details: { name: 'Test' },
          }),
          getCredentialDetails: async (api) => ({
            identifiers: { externalId: '12345', user: 'user123' },
            details: {},
          }),
          testAuthRequest: async (api) => true,
          apiPropertiesToPersist: {
            credential: ['access_token', 'refresh_token'],
            entity: [],
          },
        },
        env: {
          client_id: 'test-client-id',
          client_secret: 'test-secret',
          redirect_uri: 'http://localhost:3001/api/oauth/callback',
        },
      };

      useCase.moduleDefinitions = [
        { moduleName: 'hubspot', definition: hubspotDefinition }
      ];

      mockModuleRepository.findEntity.mockResolvedValue(null);
      mockModuleRepository.createEntity.mockResolvedValue({ id: 'entity123' });

      // Params wrapped in data property
      const wrappedParams = {
        data: {
          code: 'na1-2c51-792a-461b-84fd-c73426905b73',
          state: 'e38e71e99d4e9106252629b43f4495b2',
        }
      };

      // This SHOULD work
      const result = await useCase.execute('user123', 'hubspot', wrappedParams);

      expect(result).toHaveProperty('credential_id');
      expect(result).toHaveProperty('entity_id');
      expect(mockApi.getTokenFromCode).toHaveBeenCalledWith('na1-2c51-792a-461b-84fd-c73426905b73');
    });
  });

  describe('Standard OAuth parameter structure', () => {
    it('should handle modules expecting params.code directly', async () => {
      const standardGetToken = async function (api, params) {
        // Standard modules do: get(params, 'code')
        const code = get(params, 'code');
        return api.getTokenFromCode(code);
      };

      const standardDefinition = {
        moduleName: 'standard-oauth',
        API: jest.fn().mockReturnValue(mockApi),
        requiredAuthMethods: {
          getToken: standardGetToken,
          getEntityDetails: async (api) => ({
            identifiers: { externalId: '12345', user: 'user123' },
            details: { name: 'Test' },
          }),
          getCredentialDetails: async (api) => ({
            identifiers: { externalId: '12345', user: 'user123' },
            details: {},
          }),
          testAuthRequest: async (api) => true,
          apiPropertiesToPersist: {
            credential: ['access_token', 'refresh_token'],
            entity: [],
          },
        },
        env: {
          client_id: 'test-client-id',
          client_secret: 'test-secret',
          redirect_uri: 'http://localhost:3001/api/oauth/callback',
        },
      };

      useCase.moduleDefinitions = [
        { moduleName: 'standard-oauth', definition: standardDefinition }
      ];

      mockModuleRepository.findEntity.mockResolvedValue(null);
      mockModuleRepository.createEntity.mockResolvedValue({ id: 'entity123' });

      const callbackParams = {
        code: 'oauth-code-123',
        state: 'oauth-state-456',
      };

      const result = await useCase.execute('user123', 'standard-oauth', callbackParams);

      expect(result).toHaveProperty('credential_id');
      expect(result).toHaveProperty('entity_id');
      expect(mockApi.getTokenFromCode).toHaveBeenCalledWith('oauth-code-123');
    });
  });
});
