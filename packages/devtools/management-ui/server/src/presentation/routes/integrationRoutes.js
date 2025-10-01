import { Router } from 'express'

/**
 * Routes for integration management
 */
export function createIntegrationRoutes(integrationController) {
  const router = Router()

  // Bind controller methods to maintain context
  const controller = {
    listIntegrations: integrationController.listIntegrations.bind(integrationController),
    listIntegrationOptions: integrationController.listIntegrationOptions.bind(integrationController),
    createIntegration: integrationController.createIntegration.bind(integrationController),
    updateIntegration: integrationController.updateIntegration.bind(integrationController),
    deleteIntegration: integrationController.deleteIntegration.bind(integrationController),
    addModule: integrationController.addModule.bind(integrationController),
    removeModule: integrationController.removeModule.bind(integrationController),
    updateRoutes: integrationController.updateRoutes.bind(integrationController)
  }

  // List available integration options (must be before /:id routes)
  router.get('/options', controller.listIntegrationOptions)

  // List all integrations
  router.get('/', controller.listIntegrations)

  // Create new integration
  router.post('/', controller.createIntegration)

  // Update integration
  router.put('/:id', controller.updateIntegration)

  // Delete integration
  router.delete('/:id', controller.deleteIntegration)

  // Add module to integration
  router.post('/:id/modules', controller.addModule)

  // Remove module from integration
  router.delete('/:id/modules/:moduleName', controller.removeModule)

  // Update integration routes
  router.put('/:id/routes', controller.updateRoutes)

  return router
}