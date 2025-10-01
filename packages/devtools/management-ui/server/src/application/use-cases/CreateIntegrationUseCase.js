import { Integration } from '../../domain/entities/Integration.js'
import { IntegrationStatus } from '../../domain/value-objects/IntegrationStatus.js'

/**
 * Use case for creating a new integration
 * Uses Frigg CLI to generate the integration code file
 */
export class CreateIntegrationUseCase {
  constructor({ integrationRepository, apiModuleRepository, friggCliAdapter }) {
    this.integrationRepository = integrationRepository
    this.apiModuleRepository = apiModuleRepository
    this.friggCliAdapter = friggCliAdapter
  }

  async execute({ name, modules = [], display = {} }) {
    // Validate the integration doesn't already exist
    const existing = await this.integrationRepository.findByName(name)
    if (existing) {
      throw new Error(`Integration ${name} already exists`)
    }

    // Validate all modules exist and are installed
    const moduleEntities = {}
    for (const moduleName of modules) {
      const module = await this.apiModuleRepository.findByName(moduleName)
      if (!module) {
        throw new Error(`API Module ${moduleName} not found`)
      }
      if (!module.isInstalled) {
        throw new Error(`API Module ${moduleName} is not installed`)
      }
      moduleEntities[moduleName] = {
        definition: module
      }
    }

    // Create the Integration entity
    const integration = Integration.create({
      name,
      display: {
        label: display.label || name,
        description: display.description || '',
        category: display.category || 'General',
        detailsUrl: display.detailsUrl,
        icon: display.icon
      },
      modules: moduleEntities,
      routes: [],
      events: [],
      status: IntegrationStatus.DRAFT
    })

    // Use Frigg CLI to generate the integration file
    const generatedPath = await this.friggCliAdapter.generateIntegration({
      name: integration.name,
      className: integration.className,
      display: integration.display,
      modules: Object.keys(integration.modules)
    })

    integration.path = generatedPath

    // Save the integration
    await this.integrationRepository.save(integration)

    return integration
  }
}