/**
 * OAuth Parameters Adapter (Hexagonal Architecture - Port)
 *
 * Purpose: Transform OAuth callback parameters to match module-specific expectations
 *
 * Why needed:
 * - v1 modules expect: params.data.code
 * - OAuth callbacks provide: { code, state }
 * - This adapter bridges the gap
 */

/**
 * Interface for OAuth parameter transformation
 */
class OAuthParamsAdapterInterface {
  /**
   * Transform OAuth callback params to module-expected format
   * @param {Object} params - OAuth callback params { code, state }
   * @returns {Object} Transformed params matching module expectations
   */
  transform(params) {
    throw new Error('transform() must be implemented');
  }
}

/**
 * V1 Module Adapter - wraps params in data property
 * Used by all v1 API modules (HubSpot, Salesforce, etc.)
 */
class V1OAuthParamsAdapter extends OAuthParamsAdapterInterface {
  transform(params) {
    // v1 modules expect: get(params.data, 'code')
    return {
      data: params
    };
  }
}

/**
 * V2 Module Adapter - passes params directly
 * Future-proof for modules that expect { code, state } directly
 */
class V2OAuthParamsAdapter extends OAuthParamsAdapterInterface {
  transform(params) {
    // v2 modules expect params directly
    return params;
  }
}

/**
 * Factory to create appropriate adapter based on module version
 */
class OAuthParamsAdapterFactory {
  static create(moduleVersion = 'v1') {
    switch (moduleVersion) {
      case 'v1':
        return new V1OAuthParamsAdapter();
      case 'v2':
        return new V2OAuthParamsAdapter();
      default:
        return new V1OAuthParamsAdapter(); // Default to v1 for backward compatibility
    }
  }
}

module.exports = {
  OAuthParamsAdapterInterface,
  V1OAuthParamsAdapter,
  V2OAuthParamsAdapter,
  OAuthParamsAdapterFactory,
};
