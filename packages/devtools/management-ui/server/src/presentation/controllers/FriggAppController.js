export class FriggAppController {
  constructor({
    connectToFriggAppUseCase,
    autoConnectUseCase,
    getUserManagementModeUseCase,
    manageGlobalEntitiesUseCase,
    adminApiAdapter,
    sharedSecretProxyUseCase
  }) {
    this._connectUseCase = connectToFriggAppUseCase
    this._autoConnectUseCase = autoConnectUseCase
    this._userModeUseCase = getUserManagementModeUseCase
    this._globalEntitiesUseCase = manageGlobalEntitiesUseCase
    this._adminApiAdapter = adminApiAdapter
    this._sharedSecretProxyUseCase = sharedSecretProxyUseCase
  }

  async connect(req, res) {
    const { friggAppUrl, adminApiKey } = req.body
    const result = await this._connectUseCase.execute({ friggAppUrl, adminApiKey })

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error })
    }

    return res.json({
      success: true,
      connection: result.connection,
      userManagementMode: result.userManagementMode,
      appDefinition: result.appDefinition
    })
  }

  async autoConnect(req, res) {
    const { friggAppUrl, repositoryPath } = req.body
    const result = await this._autoConnectUseCase.execute({ friggAppUrl, repositoryPath })

    if (!result.success) {
      const status = result.error === 'Auto-connect only allowed for localhost' ? 403 : 400
      return res.status(status).json({ success: false, error: result.error })
    }

    return res.json({
      success: true,
      connection: result.connection,
      userManagementMode: result.userManagementMode,
      appDefinition: result.appDefinition,
      keySource: result.keySource
    })
  }

  async disconnect(req, res) {
    await this._connectUseCase.disconnect()
    return res.json({ success: true, message: 'Disconnected from Frigg app' })
  }

  async getConnectionStatus(req, res) {
    const status = this._connectUseCase.getStatus()
    return res.json({ success: true, ...status })
  }

  async getUserManagementMode(req, res) {
    const result = await this._userModeUseCase.execute()

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error })
    }

    return res.json({ success: true, mode: result.mode })
  }

  async getAuthMethods(req, res) {
    const methods = this._userModeUseCase.getAvailableAuthMethods()
    return res.json({ success: true, methods })
  }

  async listUsers(req, res) {
    try {
      const { page, limit } = req.query
      const result = await this._adminApiAdapter.listUsers({
        page: parseInt(page) || 1,
        limit: parseInt(limit) || 10
      })
      return res.json({ success: true, ...result })
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message })
    }
  }

  async searchUsers(req, res) {
    try {
      const { q, limit } = req.query
      const result = await this._adminApiAdapter.searchUsers(q, {
        limit: parseInt(limit) || 20
      })
      return res.json({ success: true, ...result })
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message })
    }
  }

  async createUser(req, res) {
    try {
      const result = await this._adminApiAdapter.createUser(req.body)
      return res.status(201).json({ success: true, user: result })
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message })
    }
  }

  async deleteUser(req, res) {
    try {
      await this._adminApiAdapter.deleteUser(req.params.userId)
      return res.json({ success: true, message: 'User deleted' })
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message })
    }
  }

  async impersonateUser(req, res) {
    try {
      const result = await this._adminApiAdapter.impersonateUser(req.params.userId)
      return res.json({ success: true, ...result })
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message })
    }
  }

  async listGlobalEntities(req, res) {
    const result = await this._globalEntitiesUseCase.list()

    if (!result.success) {
      return res.status(500).json({ success: false, error: result.error })
    }

    return res.json({ success: true, entities: result.entities })
  }

  async getGlobalEntity(req, res) {
    const result = await this._globalEntitiesUseCase.get(req.params.entityId)

    if (!result.success) {
      const status = result.error.includes('not found') ? 404 : 500
      return res.status(status).json({ success: false, error: result.error })
    }

    return res.json({ success: true, entity: result.entity })
  }

  async createGlobalEntity(req, res) {
    const result = await this._globalEntitiesUseCase.create(req.body)

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error })
    }

    return res.status(201).json({ success: true, entity: result.entity })
  }

  async updateGlobalEntity(req, res) {
    const result = await this._globalEntitiesUseCase.update(req.params.entityId, req.body)

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error })
    }

    return res.json({ success: true, entity: result.entity })
  }

  async deleteGlobalEntity(req, res) {
    const result = await this._globalEntitiesUseCase.delete(req.params.entityId)

    if (!result.success) {
      return res.status(400).json({ success: false, error: result.error })
    }

    return res.json({ success: true, message: 'Global entity deleted' })
  }

  async testGlobalEntity(req, res) {
    const result = await this._globalEntitiesUseCase.test(req.params.entityId)

    return res.json({
      success: result.success,
      status: result.status,
      responseTime: result.responseTime,
      error: result.error
    })
  }

  async getAvailableModules(req, res) {
    try {
      const result = await this._adminApiAdapter.getAvailableModules()
      return res.json({ success: true, modules: result.modules || [] })
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message })
    }
  }

  async getAuthRequirements(req, res) {
    try {
      const { entityType, isGlobal } = req.query
      if (!entityType) {
        return res.status(400).json({ success: false, error: 'entityType is required' })
      }

      const result = await this._adminApiAdapter.getAuthRequirements(entityType, { isGlobal: isGlobal === 'true' })
      return res.json({ success: true, requirements: result })
    } catch (error) {
      return res.status(500).json({ success: false, error: error.message })
    }
  }

  async proxySharedSecret(req, res) {
    const { appUserId, appOrgId, repositoryPath, friggAppUrl } = req.body
    const method = req.body.method || req.method
    const targetPath = req.params[0] || req.body.path

    if (!targetPath) {
      return res.status(400).json({ success: false, error: 'Target path is required' })
    }

    const result = await this._sharedSecretProxyUseCase.execute({
      method,
      path: targetPath.startsWith('/') ? targetPath : `/${targetPath}`,
      appUserId,
      appOrgId,
      body: method !== 'GET' ? req.body.data : undefined,
      repositoryPath,
      friggAppUrl
    })

    if (!result.success) {
      const status = result.error === 'Not connected to Frigg app' ? 503
        : result.error === 'FRIGG_API_KEY not found' ? 503
        : 400
      return res.status(status).json({ success: false, error: result.error })
    }

    return res.status(result.status).json({
      success: true,
      data: result.data
    })
  }
}
