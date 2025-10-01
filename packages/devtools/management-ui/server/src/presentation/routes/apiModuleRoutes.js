import { Router } from 'express'

/**
 * Routes for API module management
 */
export function createAPIModuleRoutes(apiModuleController) {
  const router = Router()

  // Bind controller methods
  const controller = {
    listModules: apiModuleController.listModules.bind(apiModuleController),
    getModule: apiModuleController.getModule.bind(apiModuleController),
    installModule: apiModuleController.installModule.bind(apiModuleController),
    updateModule: apiModuleController.updateModule.bind(apiModuleController),
    searchModules: apiModuleController.searchModules.bind(apiModuleController),
    discoverModules: apiModuleController.discoverModules.bind(apiModuleController)
  }

  // List all modules
  router.get('/', controller.listModules)

  // Search modules
  router.get('/search', controller.searchModules)

  // Discover new modules
  router.post('/discover', controller.discoverModules)

  // Get specific module
  router.get('/:name', controller.getModule)

  // Install module
  router.post('/install', controller.installModule)

  // Update module
  router.put('/:name', controller.updateModule)

  return router
}