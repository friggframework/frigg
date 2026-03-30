/**
 * AdminApiConfig Value Object
 * Configuration for connecting to the Frigg app's admin API
 *
 * This value object encapsulates the connection configuration including:
 * - Base URL of the running Frigg app
 * - Admin API key for authentication (X-API-Key header)
 * - Request timeout settings
 */
export class AdminApiConfig {
  static DEFAULT_TIMEOUT = 30000

  /**
   * Create AdminApiConfig from environment variables
   * @param {object} env - Environment object (e.g., process.env)
   * @returns {AdminApiConfig}
   */
  static fromEnv(env = {}) {
    return new AdminApiConfig({
      baseUrl: env.FRIGG_APP_URL || null,
      apiKey: env.FRIGG_ADMIN_API_KEY || null,
      timeout: env.FRIGG_API_TIMEOUT ? parseInt(env.FRIGG_API_TIMEOUT, 10) : AdminApiConfig.DEFAULT_TIMEOUT,
      isProduction: env.NODE_ENV === 'production'
    })
  }

  /**
   * @param {object} config
   * @param {string|null} config.baseUrl - Base URL of the Frigg app
   * @param {string|null} config.apiKey - Admin API key for authentication
   * @param {number} [config.timeout=30000] - Request timeout in milliseconds
   * @param {boolean} [config.isProduction=false] - Whether running in production mode
   */
  constructor({ baseUrl, apiKey, timeout = AdminApiConfig.DEFAULT_TIMEOUT, isProduction = false }) {
    this._baseUrl = baseUrl || null
    this._apiKey = apiKey || null
    this._timeout = timeout
    this._isProduction = isProduction
    Object.freeze(this)
  }

  /**
   * Get the base URL
   * @returns {string|null}
   */
  getBaseUrl() {
    return this._baseUrl
  }

  /**
   * Get the API key
   * @returns {string|null}
   */
  getApiKey() {
    return this._apiKey
  }

  /**
   * Get the timeout value
   * @returns {number}
   */
  getTimeout() {
    return this._timeout
  }

  /**
   * Check if the config is complete (has both baseUrl and apiKey)
   * @returns {boolean}
   */
  isConfigured() {
    return Boolean(this._baseUrl) && Boolean(this._apiKey)
  }

  /**
   * Validate the configuration
   * @throws {Error} If configuration is invalid
   */
  validate() {
    // Check baseUrl is present
    if (!this._baseUrl) {
      throw new Error('baseUrl is required')
    }

    // Validate URL format
    try {
      const url = new URL(this._baseUrl)
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new Error('Invalid baseUrl format: must be http or https')
      }
    } catch (error) {
      if (error.message.includes('Invalid baseUrl format')) {
        throw error
      }
      throw new Error('Invalid baseUrl format')
    }

    // Validate API key in production
    if (this._isProduction && !this._apiKey) {
      throw new Error('apiKey is required in production')
    }
  }

  /**
   * Get auth headers for API requests
   * @returns {object} Headers object
   */
  getAuthHeaders() {
    const headers = {
      'Content-Type': 'application/json'
    }

    if (this._apiKey) {
      headers['X-API-Key'] = this._apiKey
    }

    return headers
  }

  /**
   * Get normalized base URL (removes trailing slashes)
   * @returns {string}
   */
  getNormalizedBaseUrl() {
    if (!this._baseUrl) {
      return ''
    }
    return this._baseUrl.replace(/\/+$/, '')
  }

  /**
   * Serialize to JSON (excludes sensitive data)
   * @returns {object}
   */
  toJSON() {
    return {
      baseUrl: this._baseUrl,
      timeout: this._timeout,
      isConfigured: this.isConfigured()
    }
  }

  /**
   * Check equality with another AdminApiConfig
   * @param {AdminApiConfig} other
   * @returns {boolean}
   */
  equals(other) {
    if (!(other instanceof AdminApiConfig)) {
      return false
    }

    return (
      this._baseUrl === other._baseUrl &&
      this._apiKey === other._apiKey &&
      this._timeout === other._timeout
    )
  }
}
