/**
 * Controller for API module management endpoints
 */
export class APIModuleController {
  constructor({ apiModuleService }) {
    this.apiModuleService = apiModuleService
  }

  async listModules(req, res, next) {
    try {
      const { source = 'all', installed } = req.query
      const includeInstalled = installed === 'true' || installed === undefined

      const modules = await this.apiModuleService.listModules({
        source,
        includeInstalled
      })

      res.json({
        success: true,
        data: modules.map(m => m.toJSON())
      })
    } catch (error) {
      next(error)
    }
  }

  async getModule(req, res, next) {
    try {
      const { name } = req.params
      const module = await this.apiModuleService.getModuleByName(name)

      if (!module) {
        return res.status(404).json({
          success: false,
          error: `Module ${name} not found`
        })
      }

      res.json({
        success: true,
        data: module.toJSON()
      })
    } catch (error) {
      next(error)
    }
  }

  async installModule(req, res, next) {
    try {
      const { packageName, version } = req.body

      if (!packageName) {
        return res.status(400).json({
          success: false,
          error: 'Package name is required'
        })
      }

      const module = await this.apiModuleService.installModule(packageName, version)

      res.status(201).json({
        success: true,
        message: `Module ${packageName} installed successfully`,
        data: module.toJSON()
      })
    } catch (error) {
      next(error)
    }
  }

  async updateModule(req, res, next) {
    try {
      const { name } = req.params
      const { version } = req.body

      const module = await this.apiModuleService.updateModule(name, version)

      res.json({
        success: true,
        message: `Module ${name} updated successfully`,
        data: module.toJSON()
      })
    } catch (error) {
      next(error)
    }
  }

  async searchModules(req, res, next) {
    try {
      const { q } = req.query

      if (!q || q.length < 2) {
        return res.status(400).json({
          success: false,
          error: 'Search query must be at least 2 characters'
        })
      }

      const modules = await this.apiModuleService.searchModules(q)

      res.json({
        success: true,
        data: modules.map(m => m.toJSON()),
        total: modules.length
      })
    } catch (error) {
      next(error)
    }
  }

  async discoverModules(req, res, next) {
    try {
      const discovered = await this.apiModuleService.discoverModules()

      res.json({
        success: true,
        message: 'Module discovery completed',
        data: {
          discovered: discovered.map(m => m.toJSON()),
          total: discovered.length
        }
      })
    } catch (error) {
      next(error)
    }
  }
}