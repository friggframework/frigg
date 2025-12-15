/**
 * ConnectToFriggAppUseCase
 * Application Layer - Use case for establishing connection to a running Frigg app
 *
 * This use case:
 * - Validates connection parameters
 * - Establishes connection to the Frigg app via the HTTP adapter
 * - Retrieves and caches user configuration
 * - Returns connection status and capabilities
 */

import { AdminApiConfig } from '../../../domain/value-objects/AdminApiConfig.js'

export class ConnectToFriggAppUseCase {
  /**
   * @param {object} params
   * @param {FriggAppHttpAdapter} params.friggAppAdapter - Adapter for Frigg app communication
   * @param {SettingsRepository} params.settingsRepository - Repository for caching settings
   */
  constructor({ friggAppAdapter, settingsRepository }) {
    this._friggAppAdapter = friggAppAdapter
    this._settingsRepository = settingsRepository
  }

  /**
   * Execute the connection
   * @param {object} [params] - Connection parameters
   * @param {string} [params.friggAppUrl] - URL of the Frigg app
   * @param {string} [params.adminApiKey] - Admin API key
   * @returns {Promise<object>} Connection result
   */
  async execute(params = {}) {
    let { friggAppUrl, adminApiKey } = params

    // If no params provided, try to use cached settings
    if (!friggAppUrl || !adminApiKey) {
      const cachedSettings = await this._settingsRepository.get('friggAppConnection')

      if (cachedSettings) {
        friggAppUrl = friggAppUrl || cachedSettings.baseUrl
        adminApiKey = adminApiKey || cachedSettings.apiKey
      }
    }

    // Validate we have required parameters
    if (!friggAppUrl && !adminApiKey) {
      return {
        success: false,
        error: 'No connection settings provided. Please provide friggAppUrl and adminApiKey.'
      }
    }

    // Validate URL format
    if (!this._isValidUrl(friggAppUrl)) {
      return {
        success: false,
        error: 'Invalid URL format. Please provide a valid HTTP/HTTPS URL.'
      }
    }

    // Validate API key
    if (!adminApiKey) {
      return {
        success: false,
        error: 'API key is required for admin access.'
      }
    }

    // Create config
    const config = new AdminApiConfig({
      baseUrl: friggAppUrl,
      apiKey: adminApiKey
    })

    try {
      // Connect to Frigg app
      const connection = await this._friggAppAdapter.connect(config)

      // Check if connection was successful
      if (!connection.isConnected()) {
        return {
          success: false,
          error: connection.getErrorMessage() || 'Failed to connect to Frigg app'
        }
      }

      // Cache successful connection settings
      await this._settingsRepository.set('friggAppConnection', {
        baseUrl: friggAppUrl,
        apiKey: adminApiKey,
        connectedAt: new Date().toISOString()
      })

      // Return success with connection details
      const userManagementMode = connection.getUserManagementMode()

      return {
        success: true,
        connection: connection.toJSON(),
        userManagementMode: userManagementMode?.toJSON() || null,
        appDefinition: connection.getAppDefinition()
      }
    } catch (error) {
      return {
        success: false,
        error: `Connection failed: ${error.message}`
      }
    }
  }

  /**
   * Disconnect from Frigg app
   */
  async disconnect() {
    this._friggAppAdapter.disconnect()
  }

  /**
   * Get current connection status
   * @returns {object} Status object
   */
  getStatus() {
    const connection = this._friggAppAdapter.getConnection()
    const isConnected = this._friggAppAdapter.isConnected()

    return {
      isConnected,
      baseUrl: connection.getBaseUrl(),
      state: connection.getState(),
      isHealthy: connection.isHealthy(),
      userManagementMode: connection.getUserManagementMode()?.toJSON() || null,
      lastChecked: connection.getLastChecked()?.toISOString() || null
    }
  }

  /**
   * Validate URL format
   * @param {string} url - URL to validate
   * @returns {boolean}
   * @private
   */
  _isValidUrl(url) {
    if (!url) return false

    try {
      const parsed = new URL(url)
      return ['http:', 'https:'].includes(parsed.protocol)
    } catch {
      return false
    }
  }
}
