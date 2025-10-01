import { Integration } from '../../domain/entities/Integration.js'
import { IntegrationStatus } from '../../domain/value-objects/IntegrationStatus.js'

/**
 * InstallIntegrationUseCase
 * Orchestrates the installation of an integration
 */
export class InstallIntegrationUseCase {
  constructor(integrationRepository) {
    this.integrationRepository = integrationRepository
  }

  /**
   * Execute the use case
   * @param {string} integrationName
   * @returns {Promise<Integration>}
   */
  async execute(integrationName) {
    if (!integrationName || typeof integrationName !== 'string') {
      throw new Error('Integration name is required and must be a string')
    }

    try {
      // Check if integration already exists
      const existingIntegration = await this.integrationRepository.getByName(integrationName)
      if (existingIntegration) {
        throw new Error(`Integration '${integrationName}' is already installed`)
      }

      // Install the integration
      const integrationData = await this.integrationRepository.install(integrationName)
      const integration = Integration.fromObject(integrationData)

      // Set status to installing during the process
      integration.updateStatus(IntegrationStatus.STATUSES.INSTALLING)

      return integration
    } catch (error) {
      throw new Error(`Failed to install integration '${integrationName}': ${error.message}`)
    }
  }
}