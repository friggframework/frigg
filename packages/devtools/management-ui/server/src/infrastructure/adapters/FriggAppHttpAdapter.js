/**
 * FriggAppHttpAdapter
 * Infrastructure adapter for communicating with running Frigg app via HTTP
 *
 * This adapter:
 * - Establishes connection to a running Frigg app
 * - Authenticates using X-API-Key header (ADMIN_API_KEY)
 * - Retrieves app definition and user configuration
 * - Provides health check functionality
 * - Proxies requests to the Frigg app's admin API
 */

import { FriggAppConnection } from '../../domain/value-objects/FriggAppConnection.js'
import { UserManagementMode } from '../../domain/value-objects/UserManagementMode.js'

export class FriggAppHttpAdapter {
  /**
   * @param {object} params
   * @param {object} params.httpClient - HTTP client (axios-like interface)
   */
  constructor({ httpClient }) {
    this._httpClient = httpClient
    this._connection = FriggAppConnection.disconnected()
    this._config = null
  }

  /**
   * Connect to a Frigg app
   * @param {AdminApiConfig} config - Connection configuration
   * @returns {Promise<FriggAppConnection>}
   */
  async connect(config) {
    // Validate config
    try {
      config.validate()
    } catch (error) {
      this._connection = FriggAppConnection.error(config, `Invalid config: ${error.message}`)
      return this._connection
    }

    this._config = config
    this._connection = FriggAppConnection.connecting(config)

    try {
      // Check health first
      const healthResponse = await this._httpClient.get(
        `${config.getNormalizedBaseUrl()}/health`,
        { headers: config.getAuthHeaders() }
      )

      const healthStatus = healthResponse.data

      // If unhealthy, return error state (accept both 'healthy' and 'ok' as healthy statuses)
      const isHealthy = healthStatus.status === 'healthy' || healthStatus.status === 'ok'
      if (!isHealthy) {
        this._connection = FriggAppConnection.error(
          config,
          `Frigg app is unhealthy: ${healthStatus.error || 'Unknown error'}`
        )
        return this._connection
      }

      // Get app definition
      let appDefinition = null
      try {
        const configResponse = await this._httpClient.get(
          `${config.getNormalizedBaseUrl()}/api/config`,
          { headers: config.getAuthHeaders() }
        )
        appDefinition = configResponse.data
      } catch (configError) {
        // App config endpoint may not exist, use default
        console.warn('Could not fetch app config:', configError.message)
        appDefinition = {}
      }

      // Create user management mode from app definition
      const userManagementMode = UserManagementMode.fromAppDefinition(appDefinition)

      // Set connected state
      this._connection = FriggAppConnection.connected({
        config,
        healthStatus,
        userManagementMode,
        appDefinition
      })

      return this._connection
    } catch (error) {
      this._connection = FriggAppConnection.error(
        config,
        `Connection failed: ${error.message}`
      )
      return this._connection
    }
  }

  /**
   * Disconnect from the Frigg app
   */
  disconnect() {
    this._connection = FriggAppConnection.disconnected()
    this._config = null
  }

  /**
   * Check health of connected Frigg app
   * @returns {Promise<object>} Health status
   */
  async checkHealth() {
    if (!this.isConnected()) {
      throw new Error('Not connected to Frigg app')
    }

    try {
      const response = await this._httpClient.get(
        `${this._config.getNormalizedBaseUrl()}/health`,
        { headers: this._config.getAuthHeaders() }
      )

      const healthStatus = response.data

      // Update connection with new health status
      this._connection = this._connection.withUpdatedHealth(healthStatus)

      return healthStatus
    } catch (error) {
      const errorHealth = { status: 'unhealthy', error: error.message }
      this._connection = this._connection.withUpdatedHealth(errorHealth)
      return errorHealth
    }
  }

  /**
   * Get app definition from connected Frigg app
   * @returns {Promise<object>} App definition
   */
  async getAppDefinition() {
    if (!this.isConnected()) {
      throw new Error('Not connected to Frigg app')
    }

    return this._connection.getAppDefinition()
  }

  /**
   * Get user config from app definition
   * @returns {Promise<object>} User configuration
   */
  async getUserConfig() {
    if (!this.isConnected()) {
      throw new Error('Not connected to Frigg app')
    }

    const appDefinition = await this.getAppDefinition()
    return appDefinition?.user || {}
  }

  /**
   * Get current connection state
   * @returns {FriggAppConnection}
   */
  getConnection() {
    return this._connection
  }

  /**
   * Check if connected to Frigg app
   * @returns {boolean}
   */
  isConnected() {
    return this._connection.isConnected()
  }

  /**
   * Make authenticated request to the Frigg app
   * @param {string} method - HTTP method (GET, POST, PUT, DELETE)
   * @param {string} path - API path
   * @param {object} [data] - Request body for POST/PUT, or { params } for GET query params
   * @returns {Promise<object>} Response data
   */
  async makeRequest(method, path, data = null) {
    if (!this.isConnected()) {
      throw new Error('Not connected to Frigg app')
    }

    const url = `${this._config.getNormalizedBaseUrl()}${path}`
    const options = {
      headers: this._config.getAuthHeaders(),
      timeout: this._config.getTimeout()
    }

    let response
    switch (method.toUpperCase()) {
      case 'GET':
        // For GET requests, data can contain { params } for query string
        if (data?.params) {
          options.params = data.params
        }
        response = await this._httpClient.get(url, options)
        break
      case 'POST':
        response = await this._httpClient.post(url, data, options)
        break
      case 'PUT':
        response = await this._httpClient.put(url, data, options)
        break
      case 'DELETE':
        response = await this._httpClient.delete(url, options)
        break
      default:
        throw new Error(`Unsupported HTTP method: ${method}`)
    }

    return response.data
  }
}
