import { Integration } from '../../domain/entities/Integration.js'
import { IntegrationStatus } from '../../domain/value-objects/IntegrationStatus.js'

/**
 * ListIntegrationsUseCase
 * Orchestrates the retrieval and processing of integrations
 */
export class ListIntegrationsUseCase {
  constructor(integrationRepository) {
    this.integrationRepository = integrationRepository
  }

  /**
   * Execute the use case
   * @returns {Promise<Integration[]>}
   */
  async execute() {
    try {
      const integrations = await this.integrationRepository.getAll()

      // Convert to domain entities and apply business rules
      return integrations.map(integrationData => {
        const integration = Integration.fromObject(integrationData)

        // Apply business logic
        if (!integration.status) {
          integration.updateStatus(IntegrationStatus.STATUSES.INACTIVE)
        }

        return integration
      })
    } catch (error) {
      throw new Error(`Failed to list integrations: ${error.message}`)
    }
  }
}