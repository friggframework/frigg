/**
 * Application service for integration management
 * Coordinates use cases related to integrations
 */
export class IntegrationService {
  constructor({
    createIntegrationUseCase,
    updateIntegrationUseCase,
    listIntegrationsUseCase,
    deleteIntegrationUseCase
  }) {
    this.createIntegrationUseCase = createIntegrationUseCase
    this.updateIntegrationUseCase = updateIntegrationUseCase
    this.listIntegrationsUseCase = listIntegrationsUseCase
    this.deleteIntegrationUseCase = deleteIntegrationUseCase
  }

  async createIntegration(params) {
    return this.createIntegrationUseCase.execute(params)
  }

  async updateIntegration(integrationId, updates) {
    return this.updateIntegrationUseCase.execute({ integrationId, updates })
  }

  async listIntegrations(filters = {}) {
    return this.listIntegrationsUseCase.execute(filters)
  }

  async deleteIntegration(integrationId) {
    return this.deleteIntegrationUseCase.execute({ integrationId })
  }

  async addModuleToIntegration(integrationId, moduleName) {
    return this.updateIntegrationUseCase.execute({
      integrationId,
      updates: {
        addModule: { moduleName }
      }
    })
  }

  async removeModuleFromIntegration(integrationId, moduleName) {
    return this.updateIntegrationUseCase.execute({
      integrationId,
      updates: {
        removeModule: moduleName
      }
    })
  }

  async updateIntegrationRoutes(integrationId, routes) {
    return this.updateIntegrationUseCase.execute({
      integrationId,
      updates: { routes }
    })
  }

  async getIntegrationOptions() {
    // Return mock integration options for development UI
    // In production, this would query available integration packages
    return [
      {
        type: 'slack',
        displayName: 'Slack',
        description: 'Connect your Slack workspace',
        category: 'communication',
        logo: '/icons/slack.svg',
        modules: {},
        requiredEntities: []
      },
      {
        type: 'github',
        displayName: 'GitHub',
        description: 'Connect your GitHub repositories',
        category: 'development',
        logo: '/icons/github.svg',
        modules: {},
        requiredEntities: []
      }
    ]
  }
}