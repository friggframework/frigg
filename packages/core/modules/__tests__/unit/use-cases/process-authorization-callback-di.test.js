const { ProcessAuthorizationCallback } = require('../../../use-cases/process-authorization-callback');
const { V1OAuthParamsAdapter, V2OAuthParamsAdapter } = require('../../../adapters/oauth-params-adapter');

/**
 * Test ProcessAuthorizationCallback with Dependency Injection
 *
 * This test demonstrates proper hexagonal architecture:
 * - Use case receives adapter via constructor (DI)
 * - Adapter can be mocked easily for testing
 * - Each component tested in isolation
 */
describe('ProcessAuthorizationCallback - Dependency Injection', () => {
  it('should use V1 adapter by default', () => {
    const useCase = new ProcessAuthorizationCallback({
      moduleRepository: {},
      credentialRepository: {},
      moduleDefinitions: [],
    });

    expect(useCase.oauthParamsAdapter).toBeInstanceOf(V1OAuthParamsAdapter);
  });

  it('should accept custom adapter via dependency injection', () => {
    const customAdapter = new V2OAuthParamsAdapter();

    const useCase = new ProcessAuthorizationCallback({
      moduleRepository: {},
      credentialRepository: {},
      moduleDefinitions: [],
      oauthParamsAdapter: customAdapter,  // ✅ Injected!
    });

    expect(useCase.oauthParamsAdapter).toBe(customAdapter);
  });

  it('should use mock adapter for testing', () => {
    // ✅ Easy to mock for testing
    const mockAdapter = {
      transform: jest.fn((params) => ({ mocked: params }))
    };

    const useCase = new ProcessAuthorizationCallback({
      moduleRepository: {},
      credentialRepository: {},
      moduleDefinitions: [],
      oauthParamsAdapter: mockAdapter,
    });

    // Verify adapter was injected
    expect(useCase.oauthParamsAdapter).toBe(mockAdapter);

    // Verify it can be called
    const result = useCase.oauthParamsAdapter.transform({ code: 'test' });
    expect(result).toEqual({ mocked: { code: 'test' } });
    expect(mockAdapter.transform).toHaveBeenCalledWith({ code: 'test' });
  });
});
