const {
  V1OAuthParamsAdapter,
  V2OAuthParamsAdapter,
  OAuthParamsAdapterFactory,
} = require('../oauth-params-adapter');

describe('OAuthParamsAdapter', () => {
  describe('V1OAuthParamsAdapter', () => {
    it('should wrap params in data property', () => {
      const adapter = new V1OAuthParamsAdapter();
      const oauthParams = {
        code: 'na1-2c51-792a-461b-84fd-c73426905b73',
        state: 'e38e71e99d4e9106252629b43f4495b2',
      };

      const result = adapter.transform(oauthParams);

      expect(result).toEqual({
        data: {
          code: 'na1-2c51-792a-461b-84fd-c73426905b73',
          state: 'e38e71e99d4e9106252629b43f4495b2',
        }
      });
    });
  });

  describe('V2OAuthParamsAdapter', () => {
    it('should pass params directly without wrapping', () => {
      const adapter = new V2OAuthParamsAdapter();
      const oauthParams = {
        code: 'oauth-code-123',
        state: 'oauth-state-456',
      };

      const result = adapter.transform(oauthParams);

      expect(result).toEqual(oauthParams);
      expect(result).toBe(oauthParams); // Same reference
    });
  });

  describe('OAuthParamsAdapterFactory', () => {
    it('should create V1 adapter for v1 modules', () => {
      const adapter = OAuthParamsAdapterFactory.create('v1');
      expect(adapter).toBeInstanceOf(V1OAuthParamsAdapter);
    });

    it('should create V2 adapter for v2 modules', () => {
      const adapter = OAuthParamsAdapterFactory.create('v2');
      expect(adapter).toBeInstanceOf(V2OAuthParamsAdapter);
    });

    it('should default to V1 adapter when version not specified', () => {
      const adapter = OAuthParamsAdapterFactory.create();
      expect(adapter).toBeInstanceOf(V1OAuthParamsAdapter);
    });

    it('should default to V1 adapter for unknown versions', () => {
      const adapter = OAuthParamsAdapterFactory.create('v99');
      expect(adapter).toBeInstanceOf(V1OAuthParamsAdapter);
    });
  });
});
