import { ListIntegrationsUseCase } from '../use-cases/ListIntegrationsUseCase.js'
import { InstallIntegrationUseCase } from '../use-cases/InstallIntegrationUseCase.js'

/**
 * IntegrationService
 * Application service that orchestrates integration-related operations
 */
export class IntegrationService {
  constructor(integrationRepository) {
    this.integrationRepository = integrationRepository

    // Initialize use cases
    this.listIntegrationsUseCase = new ListIntegrationsUseCase(integrationRepository)
    this.installIntegrationUseCase = new InstallIntegrationUseCase(integrationRepository)
  }

  /**
   * Get all integrations
   * @returns {Promise<Integration[]>}
   */
  async listIntegrations() {
    return this.listIntegrationsUseCase.execute()
  }

  /**
   * Get integration by name
   * @param {string} name
   * @returns {Promise<Integration|null>}
   */
  async getIntegration(name) {
    return this.integrationRepository.getByName(name)
  }

  /**
   * Install integration
   * @param {string} name
   * @returns {Promise<Integration>}
   */
  async installIntegration(name) {
    return this.installIntegrationUseCase.execute(name)
  }

  /**
   * Uninstall integration
   * @param {string} name
   * @returns {Promise<boolean>}
   */
  async uninstallIntegration(name) {
    if (!name || typeof name !== 'string') {
      throw new Error('Integration name is required and must be a string')
    }

    return this.integrationRepository.uninstall(name)
  }

  /**
   * Update integration configuration
   * @param {string} name
   * @param {Object} config
   * @returns {Promise<Integration>}
   */
  async updateIntegrationConfig(name, config) {
    if (!name || typeof name !== 'string') {
      throw new Error('Integration name is required and must be a string')
    }

    if (!config || typeof config !== 'object') {
      throw new Error('Configuration is required and must be an object')
    }

    return this.integrationRepository.updateConfig(name, config)
  }

  /**
   * Check integration connection
   * @param {string} name
   * @returns {Promise<boolean>}
   */
  async checkIntegrationConnection(name) {
    if (!name || typeof name !== 'string') {
      throw new Error('Integration name is required and must be a string')
    }

    return this.integrationRepository.checkConnection(name)
  }
}