/**
 * Controller for integration-related HTTP endpoints
 * Handles request/response and delegates to application services
 */
export class IntegrationController {
  constructor({ integrationService }) {
    this.integrationService = integrationService
  }

  async listIntegrations(req, res, next) {
    try {
      const { status, hasModule, isConfigured } = req.query
      const filters = {
        status,
        hasModule,
        isConfigured: isConfigured === 'true' ? true : isConfigured === 'false' ? false : undefined
      }

      const integrations = await this.integrationService.listIntegrations(filters)

      // Return just the integrations array for consistency with core API
      res.json(integrations)
    } catch (error) {
      next(error)
    }
  }

  async listIntegrationOptions(req, res, next) {
    try {
      // Return available integration types (mock data for dev UI)
      const options = await this.integrationService.getIntegrationOptions()
      res.json({
        integrations: options,
        count: options.length
      })
    } catch (error) {
      next(error)
    }
  }

  async createIntegration(req, res, next) {
    try {
      const { name, modules = [], display = {} } = req.body

      if (!name) {
        return res.status(400).json({
          success: false,
          error: 'Integration name is required'
        })
      }

      const integration = await this.integrationService.createIntegration({
        name,
        modules,
        display
      })

      res.status(201).json({
        success: true,
        data: integration.toJSON()
      })
    } catch (error) {
      next(error)
    }
  }

  async updateIntegration(req, res, next) {
    try {
      const { id } = req.params
      const updates = req.body

      const integration = await this.integrationService.updateIntegration(id, updates)

      res.json({
        success: true,
        data: integration.toJSON()
      })
    } catch (error) {
      next(error)
    }
  }

  async deleteIntegration(req, res, next) {
    try {
      const { id } = req.params

      const result = await this.integrationService.deleteIntegration(id)

      res.json({
        success: true,
        data: result
      })
    } catch (error) {
      next(error)
    }
  }

  async addModule(req, res, next) {
    try {
      const { id } = req.params
      const { moduleName } = req.body

      if (!moduleName) {
        return res.status(400).json({
          success: false,
          error: 'Module name is required'
        })
      }

      const integration = await this.integrationService.addModuleToIntegration(id, moduleName)

      res.json({
        success: true,
        data: integration.toJSON()
      })
    } catch (error) {
      next(error)
    }
  }

  async removeModule(req, res, next) {
    try {
      const { id, moduleName } = req.params

      const integration = await this.integrationService.removeModuleFromIntegration(id, moduleName)

      res.json({
        success: true,
        data: integration.toJSON()
      })
    } catch (error) {
      next(error)
    }
  }

  async updateRoutes(req, res, next) {
    try {
      const { id } = req.params
      const { routes } = req.body

      if (!Array.isArray(routes)) {
        return res.status(400).json({
          success: false,
          error: 'Routes must be an array'
        })
      }

      const integration = await this.integrationService.updateIntegrationRoutes(id, routes)

      res.json({
        success: true,
        data: integration.toJSON()
      })
    } catch (error) {
      next(error)
    }
  }
}