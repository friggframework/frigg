const { get } = require('../../../../assertions/get');

/**
 * This test demonstrates the HubSpot OAuth parameter bug
 *
 * The Issue:
 * - HubSpot's getToken expects: get(params.data, 'code')
 * - We're passing: { code: '...', state: '...' }
 * - Result: RequiredPropertyError "Key 'code' is a required parameter"
 *
 * All v1 OAuth modules have this same expectation.
 */
describe('HubSpot OAuth Parameter Bug', () => {
  it('should reproduce the error - HubSpot expects params.data.code', () => {
    // This is EXACTLY what HubSpot's getToken does (see api-module-library/packages/v1-ready/hubspot/definition.js:15)
    const hubspotGetToken = (params) => {
      const code = get(params.data, 'code');  // ❌ Expects params.data.code
      return code;
    };

    // This is what we're passing from OAuth callback
    const callbackParams = {
      code: 'na1-2c51-792a-461b-84fd-c73426905b73',
      state: 'e38e71e99d4e9106252629b43f4495b2',
    };

    // This SHOULD throw RequiredPropertyError
    expect(() => hubspotGetToken(callbackParams)).toThrow('Key "code" is a required parameter');
  });

  it('should work when params are wrapped in data property', () => {
    const hubspotGetToken = (params) => {
      const code = get(params.data, 'code');
      return code;
    };

    // Wrap params in data property
    const wrappedParams = {
      data: {
        code: 'na1-2c51-792a-461b-84fd-c73426905b73',
        state: 'e38e71e99d4e9106252629b43f4495b2',
      }
    };

    // This SHOULD work
    const result = hubspotGetToken(wrappedParams);
    expect(result).toBe('na1-2c51-792a-461b-84fd-c73426905b73');
  });
});
