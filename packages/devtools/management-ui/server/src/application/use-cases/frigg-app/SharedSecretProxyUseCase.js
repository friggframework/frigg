export class SharedSecretProxyUseCase {
  constructor({ connectionStateService, envFileReader, httpClient, environment = process.env }) {
    this._connectionState = connectionStateService
    this._envFileReader = envFileReader
    this._httpClient = httpClient
    this._environment = environment
  }

  async execute({ method, path, appUserId, appOrgId, body, repositoryPath, friggAppUrl }) {
    const validation = this._validateParams({ appUserId, appOrgId })
    if (!validation.valid) {
      return { success: false, error: validation.error }
    }

    // Get base URL from connection or use provided friggAppUrl
    let baseUrl = friggAppUrl
    if (!baseUrl) {
      const connection = this._connectionState.getConnection()
      if (connection?.isConnected()) {
        baseUrl = connection.getBaseUrl()
      }
    }

    if (!baseUrl) {
      return { success: false, error: 'Frigg app URL not available. Provide friggAppUrl or connect first.' }
    }

    const sharedSecret = await this._resolveSharedSecret(repositoryPath)
    if (!sharedSecret) {
      return { success: false, error: 'FRIGG_API_KEY not found' }
    }

    try {
      const response = await this._httpClient.request({
        method: method || 'GET',
        url: `${baseUrl}${path}`,
        headers: {
          'Content-Type': 'application/json',
          'x-frigg-api-key': sharedSecret,
          'x-frigg-appuserid': appUserId,
          'x-frigg-apporgid': appOrgId
        },
        data: body,
        validateStatus: () => true
      })

      return {
        success: true,
        status: response.status,
        data: response.data,
        headers: response.headers
      }
    } catch (error) {
      return {
        success: false,
        error: error.message || 'Request failed'
      }
    }
  }

  _validateParams({ appUserId, appOrgId }) {
    if (!appUserId || typeof appUserId !== 'string') {
      return { valid: false, error: 'appUserId is required' }
    }
    if (!appOrgId || typeof appOrgId !== 'string') {
      return { valid: false, error: 'appOrgId is required' }
    }
    if (appUserId.length > 100 || appOrgId.length > 100) {
      return { valid: false, error: 'User/Org ID too long (max 100 characters)' }
    }
    const validPattern = /^[a-zA-Z0-9_@.\-]+$/
    if (!validPattern.test(appUserId) || !validPattern.test(appOrgId)) {
      return { valid: false, error: 'Invalid characters in user/org ID' }
    }
    return { valid: true }
  }

  async _resolveSharedSecret(repositoryPath) {
    if (repositoryPath) {
      try {
        const secret = await this._envFileReader.readSharedSecret(repositoryPath)
        if (secret) return secret
      } catch {
        // Fall through to environment
      }
    }
    return this._environment.FRIGG_API_KEY || null
  }
}
