import { IntegrationRepository } from '../../domain/interfaces/IntegrationRepository.js'

/**
 * IntegrationRepositoryAdapter
 * Infrastructure adapter that implements IntegrationRepository interface
 */
export class IntegrationRepositoryAdapter extends IntegrationRepository {
  constructor(apiClient) {
    super()
    this._apiClient = apiClient
  }

  /**
   * Get API client for direct access
   * @returns {Object}
   */
  get apiClient() {
    return this._apiClient
  }

  /**
   * Get all integrations
   * @returns {Promise<Integration[]>}
   */
  async getAll() {
    try {
      const response = await this._apiClient.get('/api/integrations')
      const data = response.data.data || response.data
      return data.integrations || []
    } catch (error) {
      throw new Error(`Failed to fetch integrations: ${error.message}`)
    }
  }

  /**
   * Get integration by name
   * @param {string} name
   * @returns {Promise<Integration|null>}
   */
  async getByName(name) {
    try {
      const integrations = await this.getAll()
      return integrations.find(integration => integration.name === name) || null
    } catch (error) {
      throw new Error(`Failed to fetch integration '${name}': ${error.message}`)
    }
  }

  /**
   * Install integration
   * @param {string} name
   * @returns {Promise<Integration>}
   */
  async install(name) {
    try {
      const response = await this._apiClient.post('/api/integrations/install', { name })
      const data = response.data.data || response.data
      return data.integration || data
    } catch (error) {
      throw new Error(`Failed to install integration '${name}': ${error.message}`)
    }
  }

  /**
   * Uninstall integration
   * @param {string} name
   * @returns {Promise<boolean>}
   */
  async uninstall(name) {
    try {
      await this._apiClient.delete(`/api/integrations/${name}`)
      return true
    } catch (error) {
      throw new Error(`Failed to uninstall integration '${name}': ${error.message}`)
    }
  }

  /**
   * Update integration configuration
   * @param {string} name
   * @param {Object} config
   * @returns {Promise<Integration>}
   */
  async updateConfig(name, config) {
    try {
      const response = await this._apiClient.put(`/api/integrations/${name}/config`, { config })
      const data = response.data.data || response.data
      return data.integration || data
    } catch (error) {
      throw new Error(`Failed to update integration config for '${name}': ${error.message}`)
    }
  }

  /**
   * Check integration connection
   * @param {string} name
   * @returns {Promise<boolean>}
   */
  async checkConnection(name) {
    try {
      const response = await this._apiClient.get(`/api/integrations/${name}/check`)
      const data = response.data.data || response.data
      return data.connected === true
    } catch (error) {
      throw new Error(`Failed to check integration connection for '${name}': ${error.message}`)
    }
  }
}