/**
 * Use case for updating an existing integration
 * Modifies the integration Definition and regenerates the code file
 */
export class UpdateIntegrationUseCase {
  constructor({ integrationRepository, friggCliAdapter }) {
    this.integrationRepository = integrationRepository
    this.friggCliAdapter = friggCliAdapter
  }

  async execute({ integrationId, updates }) {
    // Find the integration
    const integration = await this.integrationRepository.findById(integrationId)
    if (!integration) {
      throw new Error(`Integration ${integrationId} not found`)
    }

    // Apply updates to the integration
    if (updates.display) {
      integration.updateDisplay(updates.display)
    }

    if (updates.routes) {
      // Replace routes entirely
      integration.routes = updates.routes
    }

    if (updates.addModule) {
      const { moduleName, moduleDefinition } = updates.addModule
      integration.addModule(moduleName, moduleDefinition)
    }

    if (updates.removeModule) {
      integration.removeModule(updates.removeModule)
    }

    // Regenerate the integration code file using Frigg CLI
    await this.friggCliAdapter.updateIntegrationFile({
      path: integration.path,
      className: integration.className,
      definition: {
        name: integration.name,
        version: integration.version,
        supportedVersions: integration.supportedVersions,
        hasUserConfig: integration.hasUserConfig,
        display: integration.display,
        modules: integration.modules,
        routes: integration.routes
      },
      events: integration.getEventNames()
    })

    // Save the updated integration
    await this.integrationRepository.save(integration)

    return integration
  }
}