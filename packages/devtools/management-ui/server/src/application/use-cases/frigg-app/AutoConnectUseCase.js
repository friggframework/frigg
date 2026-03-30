export class AutoConnectUseCase {
  constructor({ connectToFriggAppUseCase, envFileReader, environment = process.env }) {
    this._connectUseCase = connectToFriggAppUseCase
    this._envFileReader = envFileReader
    this._environment = environment
  }

  async execute({ friggAppUrl, repositoryPath }) {
    const validation = this._validateLocalhostUrl(friggAppUrl)
    if (!validation.valid) {
      return { success: false, error: validation.error }
    }

    const apiKeyResult = await this._resolveAdminApiKey(repositoryPath)
    if (!apiKeyResult.key) {
      return { success: false, error: 'FRIGG_ADMIN_API_KEY not found' }
    }

    const result = await this._connectUseCase.execute({
      friggAppUrl,
      adminApiKey: apiKeyResult.key
    })

    if (result.success) {
      result.keySource = apiKeyResult.source
    }

    return result
  }

  _validateLocalhostUrl(url) {
    if (!url) {
      return { valid: false, error: 'URL is required' }
    }

    try {
      const parsed = new URL(url)
      const isLocalhost = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1'
      if (!isLocalhost) {
        return { valid: false, error: 'Auto-connect only allowed for localhost' }
      }
      return { valid: true }
    } catch {
      return { valid: false, error: 'Invalid URL format' }
    }
  }

  async _resolveAdminApiKey(repositoryPath) {
    if (repositoryPath) {
      try {
        const key = await this._envFileReader.readAdminApiKey(repositoryPath)
        if (key) {
          return { key, source: 'repository' }
        }
      } catch {
        // Invalid path - continue to fallback
      }
    }

    const envKey = this._environment.FRIGG_ADMIN_API_KEY
    if (envKey) {
      return { key: envKey, source: 'environment' }
    }

    return { key: null, source: null }
  }
}
