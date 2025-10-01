/**
 * Use case for listing all integrations in the project
 */
export class ListIntegrationsUseCase {
  constructor({ integrationRepository }) {
    this.integrationRepository = integrationRepository
  }

  async execute(filters = {}) {
    let integrations = await this.integrationRepository.findAll()

    // Apply filters
    if (filters.status) {
      integrations = integrations.filter(i => i.status.value === filters.status)
    }

    if (filters.hasModule) {
      integrations = integrations.filter(i => i.hasModule(filters.hasModule))
    }

    if (filters.isConfigured !== undefined) {
      integrations = integrations.filter(i => i.isConfigured() === filters.isConfigured)
    }

    return integrations.map(i => i.toJSON())
  }
}