/**
 * Use case for deleting an integration
 * Removes the integration code file and registry entry
 */
export class DeleteIntegrationUseCase {
  constructor({ integrationRepository, friggCliAdapter }) {
    this.integrationRepository = integrationRepository
    this.friggCliAdapter = friggCliAdapter
  }

  async execute({ integrationId }) {
    // Find the integration
    const integration = await this.integrationRepository.findById(integrationId)
    if (!integration) {
      throw new Error(`Integration ${integrationId} not found`)
    }

    // Check if it can be deleted
    if (!integration.canBeDeleted()) {
      throw new Error('Integration cannot be deleted in current state')
    }

    // Delete the integration file using Frigg CLI
    if (integration.path) {
      await this.friggCliAdapter.deleteIntegrationFile(integration.path)
    }

    // Remove from repository
    await this.integrationRepository.delete(integrationId)

    return { success: true, deletedIntegration: integration.name }
  }
}