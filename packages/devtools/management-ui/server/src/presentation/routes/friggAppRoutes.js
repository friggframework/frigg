import { Router } from 'express'

/**
 * Routes for Frigg app connection and admin API operations
 *
 * These routes proxy requests to the running Frigg app's admin API,
 * using the FRIGG_ADMIN_API_KEY for authentication.
 */
export function createFriggAppRoutes(friggAppController) {
  const router = Router()

  // Bind controller methods
  const controller = {
    connect: friggAppController.connect.bind(friggAppController),
    autoConnect: friggAppController.autoConnect.bind(friggAppController),
    disconnect: friggAppController.disconnect.bind(friggAppController),
    getConnectionStatus: friggAppController.getConnectionStatus.bind(friggAppController),
    getUserManagementMode: friggAppController.getUserManagementMode.bind(friggAppController),
    getAuthMethods: friggAppController.getAuthMethods.bind(friggAppController),
    listUsers: friggAppController.listUsers.bind(friggAppController),
    searchUsers: friggAppController.searchUsers.bind(friggAppController),
    createUser: friggAppController.createUser.bind(friggAppController),
    deleteUser: friggAppController.deleteUser.bind(friggAppController),
    impersonateUser: friggAppController.impersonateUser.bind(friggAppController),
    listGlobalEntities: friggAppController.listGlobalEntities.bind(friggAppController),
    getGlobalEntity: friggAppController.getGlobalEntity.bind(friggAppController),
    createGlobalEntity: friggAppController.createGlobalEntity.bind(friggAppController),
    updateGlobalEntity: friggAppController.updateGlobalEntity.bind(friggAppController),
    deleteGlobalEntity: friggAppController.deleteGlobalEntity.bind(friggAppController),
    testGlobalEntity: friggAppController.testGlobalEntity.bind(friggAppController),
    getAvailableModules: friggAppController.getAvailableModules.bind(friggAppController),
    getAuthRequirements: friggAppController.getAuthRequirements.bind(friggAppController),
    proxySharedSecret: friggAppController.proxySharedSecret.bind(friggAppController)
  }

  // ============================================
  // Connection Management
  // ============================================

  /**
   * POST /api/frigg-app/connect
   * Connect to a running Frigg app
   * Body: { friggAppUrl: string, adminApiKey: string }
   */
  router.post('/connect', async (req, res, next) => {
    try {
      await controller.connect(req, res)
    } catch (error) {
      next(error)
    }
  })

  /**
   * POST /api/frigg-app/auto-connect
   * Auto-connect to local Frigg app using server-side FRIGG_ADMIN_API_KEY
   * Body: { friggAppUrl: string }
   */
  router.post('/auto-connect', async (req, res, next) => {
    try {
      await controller.autoConnect(req, res)
    } catch (error) {
      next(error)
    }
  })

  /**
   * POST /api/frigg-app/disconnect
   * Disconnect from Frigg app
   */
  router.post('/disconnect', async (req, res, next) => {
    try {
      await controller.disconnect(req, res)
    } catch (error) {
      next(error)
    }
  })

  /**
   * GET /api/frigg-app/connection-status
   * Get current connection status
   */
  router.get('/connection-status', async (req, res, next) => {
    try {
      await controller.getConnectionStatus(req, res)
    } catch (error) {
      next(error)
    }
  })

  // ============================================
  // User Management Mode
  // ============================================

  /**
   * GET /api/frigg-app/user-management-mode
   * Get current user management mode configuration
   */
  router.get('/user-management-mode', async (req, res, next) => {
    try {
      await controller.getUserManagementMode(req, res)
    } catch (error) {
      next(error)
    }
  })

  /**
   * GET /api/frigg-app/auth-methods
   * Get available authentication methods
   */
  router.get('/auth-methods', async (req, res, next) => {
    try {
      await controller.getAuthMethods(req, res)
    } catch (error) {
      next(error)
    }
  })

  // ============================================
  // User Management (Admin API)
  // ============================================

  /**
   * GET /api/frigg-app/admin/users
   * List users with pagination
   * Query: { page?: number, limit?: number }
   */
  router.get('/admin/users', async (req, res, next) => {
    try {
      await controller.listUsers(req, res)
    } catch (error) {
      next(error)
    }
  })

  /**
   * GET /api/frigg-app/admin/users/search
   * Search users
   * Query: { q: string, limit?: number }
   */
  router.get('/admin/users/search', async (req, res, next) => {
    try {
      await controller.searchUsers(req, res)
    } catch (error) {
      next(error)
    }
  })

  /**
   * POST /api/frigg-app/admin/users
   * Create a new user
   * Body: { email: string, password?: string, ... }
   */
  router.post('/admin/users', async (req, res, next) => {
    try {
      await controller.createUser(req, res)
    } catch (error) {
      next(error)
    }
  })

  /**
   * DELETE /api/frigg-app/admin/users/:userId
   * Delete a user
   */
  router.delete('/admin/users/:userId', async (req, res, next) => {
    try {
      await controller.deleteUser(req, res)
    } catch (error) {
      next(error)
    }
  })

  /**
   * POST /api/frigg-app/admin/users/:userId/impersonate
   * Impersonate a user (generate impersonation token)
   */
  router.post('/admin/users/:userId/impersonate', async (req, res, next) => {
    try {
      await controller.impersonateUser(req, res)
    } catch (error) {
      next(error)
    }
  })

  // ============================================
  // Global Entity Management (Admin Only)
  // ============================================

  /**
   * GET /api/frigg-app/admin/global-entities
   * List all global entities
   */
  router.get('/admin/global-entities', async (req, res, next) => {
    try {
      await controller.listGlobalEntities(req, res)
    } catch (error) {
      next(error)
    }
  })

  /**
   * GET /api/frigg-app/admin/global-entities/:entityId
   * Get a specific global entity
   */
  router.get('/admin/global-entities/:entityId', async (req, res, next) => {
    try {
      await controller.getGlobalEntity(req, res)
    } catch (error) {
      next(error)
    }
  })

  /**
   * POST /api/frigg-app/admin/global-entities
   * Create a new global entity
   * Body: { type: string, credentials?: object, ... }
   */
  router.post('/admin/global-entities', async (req, res, next) => {
    try {
      await controller.createGlobalEntity(req, res)
    } catch (error) {
      next(error)
    }
  })

  /**
   * PUT /api/frigg-app/admin/global-entities/:entityId
   * Update a global entity
   */
  router.put('/admin/global-entities/:entityId', async (req, res, next) => {
    try {
      await controller.updateGlobalEntity(req, res)
    } catch (error) {
      next(error)
    }
  })

  /**
   * DELETE /api/frigg-app/admin/global-entities/:entityId
   * Delete a global entity
   */
  router.delete('/admin/global-entities/:entityId', async (req, res, next) => {
    try {
      await controller.deleteGlobalEntity(req, res)
    } catch (error) {
      next(error)
    }
  })

  /**
   * POST /api/frigg-app/admin/global-entities/:entityId/test
   * Test a global entity's connection
   */
  router.post('/admin/global-entities/:entityId/test', async (req, res, next) => {
    try {
      await controller.testGlobalEntity(req, res)
    } catch (error) {
      next(error)
    }
  })

  /**
   * GET /api/frigg-app/admin/available-modules
   * Get list of available API modules/integrations
   */
  router.get('/admin/available-modules', async (req, res, next) => {
    try {
      await controller.getAvailableModules(req, res)
    } catch (error) {
      next(error)
    }
  })

  /**
   * GET /api/frigg-app/admin/auth-requirements
   * Get authorization requirements for a module
   * Query: { entityType: string, isGlobal?: boolean }
   */
  router.get('/admin/auth-requirements', async (req, res, next) => {
    try {
      await controller.getAuthRequirements(req, res)
    } catch (error) {
      next(error)
    }
  })

  // ============================================
  // Shared Secret Proxy (User API via shared secret auth)
  // ============================================

  /**
   * POST /api/frigg-app/proxy/shared-secret
   * Proxy requests to Frigg app using shared secret authentication
   * Body: {
   *   appUserId: string,
   *   appOrgId: string,
   *   path: string (target API path),
   *   method?: string (GET, POST, PUT, DELETE),
   *   data?: object (request body for POST/PUT),
   *   repositoryPath?: string (to read FRIGG_API_KEY from .env)
   * }
   */
  router.post('/proxy/shared-secret', async (req, res, next) => {
    try {
      await controller.proxySharedSecret(req, res)
    } catch (error) {
      next(error)
    }
  })

  return router
}
