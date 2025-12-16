import { EnvFileReader } from '../../infrastructure/adapters/EnvFileReader.js'

/**
 * FriggAppController
 * Presentation Layer - Controller for Frigg app connection and admin API operations
 *
 * Handles HTTP requests related to:
 * - Connection management to running Frigg apps
 * - User management via admin API
 * - Global entity management (admin-only)
 */

export class FriggAppController {
  /**
   * @param {object} params
   * @param {ConnectToFriggAppUseCase} params.connectToFriggAppUseCase
   * @param {GetUserManagementModeUseCase} params.getUserManagementModeUseCase
   * @param {ManageGlobalEntitiesUseCase} params.manageGlobalEntitiesUseCase
   * @param {FriggAdminApiAdapter} params.adminApiAdapter
   */
  constructor({
    connectToFriggAppUseCase,
    getUserManagementModeUseCase,
    manageGlobalEntitiesUseCase,
    adminApiAdapter
  }) {
    this._connectUseCase = connectToFriggAppUseCase
    this._userModeUseCase = getUserManagementModeUseCase
    this._globalEntitiesUseCase = manageGlobalEntitiesUseCase
    this._adminApiAdapter = adminApiAdapter
  }

  // ============================================
  // Connection Management
  // ============================================

  /**
   * POST /api/frigg-app/connect
   * Connect to a running Frigg app
   */
  async connect(req, res) {
    const { friggAppUrl, adminApiKey } = req.body

    const result = await this._connectUseCase.execute({
      friggAppUrl,
      adminApiKey
    })

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      })
    }

    return res.json({
      success: true,
      connection: result.connection,
      userManagementMode: result.userManagementMode,
      appDefinition: result.appDefinition
    })
  }

  /**
   * POST /api/frigg-app/auto-connect
   * Auto-connect to local Frigg using FRIGG_ADMIN_API_KEY
   * Reads from repository's .env file if repositoryPath provided,
   * falls back to server's environment variable
   * Only allowed for localhost URLs for security
   */
  async autoConnect(req, res) {
    const { friggAppUrl, repositoryPath } = req.body

    // SECURITY: Validate URL is localhost only
    const isLocalhost = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/.test(friggAppUrl)
    if (!isLocalhost) {
      return res.status(403).json({
        success: false,
        error: 'Auto-connect only allowed for localhost URLs'
      })
    }

    let adminApiKey = null
    let keySource = null

    // Try to read from repository's .env file first
    let searchedPaths = []
    if (repositoryPath) {
      try {
        const envReader = new EnvFileReader()
        adminApiKey = await envReader.readAdminApiKey(repositoryPath)
        if (adminApiKey) {
          keySource = 'repository .env'
        }
        // Track paths we checked for error message
        searchedPaths = [
          `${repositoryPath}/.env`,
          `${repositoryPath}/.env.local`,
          `${repositoryPath}/backend/.env`,
          `${repositoryPath}/backend/.env.local`
        ]
      } catch (error) {
        console.debug('Failed to read .env from repository:', error.message)
      }
    }

    // Fall back to server environment variable
    if (!adminApiKey) {
      adminApiKey = process.env.FRIGG_ADMIN_API_KEY
      if (adminApiKey) {
        keySource = 'server environment'
      }
    }

    if (!adminApiKey) {
      const hint = repositoryPath
        ? `Searched: ${searchedPaths.join(', ')}`
        : 'No repository path provided'
      return res.status(400).json({
        success: false,
        error: `FRIGG_ADMIN_API_KEY not found. ${hint}. Add it to your Frigg app's .env file.`
      })
    }

    console.debug(`Auto-connect using admin key from ${keySource}`)

    const result = await this._connectUseCase.execute({
      friggAppUrl,
      adminApiKey
    })

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      })
    }

    return res.json({
      success: true,
      connection: result.connection,
      userManagementMode: result.userManagementMode,
      appDefinition: result.appDefinition,
      keySource
    })
  }

  /**
   * POST /api/frigg-app/disconnect
   * Disconnect from Frigg app
   */
  async disconnect(req, res) {
    await this._connectUseCase.disconnect()

    return res.json({
      success: true,
      message: 'Disconnected from Frigg app'
    })
  }

  /**
   * GET /api/frigg-app/connection-status
   * Get current connection status
   */
  async getConnectionStatus(req, res) {
    const status = this._connectUseCase.getStatus()

    return res.json({
      success: true,
      ...status
    })
  }

  // ============================================
  // User Management Mode
  // ============================================

  /**
   * GET /api/frigg-app/user-management-mode
   * Get current user management mode configuration
   */
  async getUserManagementMode(req, res) {
    const result = await this._userModeUseCase.execute()

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      })
    }

    return res.json({
      success: true,
      mode: result.mode
    })
  }

  /**
   * GET /api/frigg-app/auth-methods
   * Get available authentication methods
   */
  async getAuthMethods(req, res) {
    const methods = this._userModeUseCase.getAvailableAuthMethods()

    return res.json({
      success: true,
      methods
    })
  }

  // ============================================
  // User Management (Admin API)
  // ============================================

  /**
   * GET /api/frigg-app/admin/users
   * List users
   */
  async listUsers(req, res) {
    try {
      const { page, limit } = req.query
      const result = await this._adminApiAdapter.listUsers({
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 10
      })

      return res.json({
        success: true,
        ...result
      })
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error.message
      })
    }
  }

  /**
   * GET /api/frigg-app/admin/users/search
   * Search users
   */
  async searchUsers(req, res) {
    try {
      const { q, limit } = req.query
      const result = await this._adminApiAdapter.searchUsers(q, {
        limit: parseInt(limit) || 20
      })

      return res.json({
        success: true,
        ...result
      })
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error.message
      })
    }
  }

  /**
   * POST /api/frigg-app/admin/users
   * Create a new user
   */
  async createUser(req, res) {
    try {
      const userData = req.body
      const result = await this._adminApiAdapter.createUser(userData)

      return res.status(201).json({
        success: true,
        user: result
      })
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error.message
      })
    }
  }

  /**
   * DELETE /api/frigg-app/admin/users/:userId
   * Delete a user
   */
  async deleteUser(req, res) {
    try {
      const { userId } = req.params
      await this._adminApiAdapter.deleteUser(userId)

      return res.json({
        success: true,
        message: 'User deleted'
      })
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error.message
      })
    }
  }

  /**
   * POST /api/frigg-app/admin/users/:userId/impersonate
   * Impersonate a user
   */
  async impersonateUser(req, res) {
    try {
      const { userId } = req.params
      const result = await this._adminApiAdapter.impersonateUser(userId)

      return res.json({
        success: true,
        ...result
      })
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error.message
      })
    }
  }

  // ============================================
  // Global Entity Management (Admin Only)
  // ============================================

  /**
   * GET /api/frigg-app/admin/global-entities
   * List all global entities
   */
  async listGlobalEntities(req, res) {
    const result = await this._globalEntitiesUseCase.list()

    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error
      })
    }

    return res.json({
      success: true,
      entities: result.entities
    })
  }

  /**
   * GET /api/frigg-app/admin/global-entities/:entityId
   * Get a specific global entity
   */
  async getGlobalEntity(req, res) {
    const { entityId } = req.params
    const result = await this._globalEntitiesUseCase.get(entityId)

    if (!result.success) {
      const status = result.error.includes('not found') ? 404 : 500
      return res.status(status).json({
        success: false,
        error: result.error
      })
    }

    return res.json({
      success: true,
      entity: result.entity
    })
  }

  /**
   * POST /api/frigg-app/admin/global-entities
   * Create a new global entity
   */
  async createGlobalEntity(req, res) {
    const entityData = req.body
    const result = await this._globalEntitiesUseCase.create(entityData)

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      })
    }

    return res.status(201).json({
      success: true,
      entity: result.entity
    })
  }

  /**
   * PUT /api/frigg-app/admin/global-entities/:entityId
   * Update a global entity
   */
  async updateGlobalEntity(req, res) {
    const { entityId } = req.params
    const updates = req.body
    const result = await this._globalEntitiesUseCase.update(entityId, updates)

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      })
    }

    return res.json({
      success: true,
      entity: result.entity
    })
  }

  /**
   * DELETE /api/frigg-app/admin/global-entities/:entityId
   * Delete a global entity
   */
  async deleteGlobalEntity(req, res) {
    const { entityId } = req.params
    const result = await this._globalEntitiesUseCase.delete(entityId)

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.error
      })
    }

    return res.json({
      success: true,
      message: 'Global entity deleted'
    })
  }

  /**
   * POST /api/frigg-app/admin/global-entities/:entityId/test
   * Test a global entity's connection
   */
  async testGlobalEntity(req, res) {
    const { entityId } = req.params
    const result = await this._globalEntitiesUseCase.test(entityId)

    return res.json({
      success: result.success,
      status: result.status,
      responseTime: result.responseTime,
      error: result.error
    })
  }
}
