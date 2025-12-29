/**
 * WriteOAuthCredentialsUseCase
 * Application use case for writing OAuth credentials to .env file
 *
 * This use case writes OAuth credentials (CLIENT_ID, CLIENT_SECRET, SCOPE)
 * to the appropriate .env file in a Frigg app repository.
 *
 * Security considerations:
 * - Creates backup before modifying
 * - Validates repository path
 * - Sanitizes inputs
 */
export class WriteOAuthCredentialsUseCase {
  /**
   * @param {object} params
   * @param {EnvFileAdapter} params.envFileAdapter - Adapter for writing .env files
   */
  constructor({ envFileAdapter }) {
    this._envFileAdapter = envFileAdapter
  }

  /**
   * Execute the use case
   * @param {object} params
   * @param {string} params.repositoryPath - Path to the Frigg app repository
   * @param {string} params.moduleName - Name of the module (e.g., 'hubspot', 'salesforce')
   * @param {object} params.credentials - OAuth credentials to write
   * @param {string} params.credentials.clientId - OAuth client ID
   * @param {string} params.credentials.clientSecret - OAuth client secret
   * @param {string} [params.credentials.scope] - OAuth scope (optional)
   * @returns {Promise<object>} Write result
   */
  async execute({ repositoryPath, moduleName, credentials }) {
    // Validate inputs
    this._validateInputs({ repositoryPath, moduleName, credentials })

    // Normalize module name
    const normalizedModuleName = moduleName.toLowerCase().replace(/[^a-z0-9-_]/g, '')

    // Sanitize credentials (remove any newlines or control characters)
    const sanitizedCredentials = {
      clientId: this._sanitizeValue(credentials.clientId),
      clientSecret: this._sanitizeValue(credentials.clientSecret),
      scope: credentials.scope ? this._sanitizeValue(credentials.scope) : undefined
    }

    // Write credentials via adapter
    const result = await this._envFileAdapter.writeOAuthCredentials(
      repositoryPath,
      normalizedModuleName,
      sanitizedCredentials
    )

    return {
      success: result.success,
      path: result.path,
      moduleName: normalizedModuleName,
      written: result.written,
      message: `OAuth credentials written to ${result.path}`,
      requiresReload: true // Backend needs to reload to pick up new env vars
    }
  }

  /**
   * Validate all inputs
   * @param {object} params - Input parameters
   * @throws {Error} If validation fails
   */
  _validateInputs({ repositoryPath, moduleName, credentials }) {
    if (!repositoryPath) {
      throw new Error('Repository path is required')
    }

    if (!moduleName) {
      throw new Error('Module name is required')
    }

    if (!credentials || typeof credentials !== 'object') {
      throw new Error('Credentials object is required')
    }

    if (!credentials.clientId || typeof credentials.clientId !== 'string') {
      throw new Error('Client ID is required and must be a string')
    }

    if (!credentials.clientSecret || typeof credentials.clientSecret !== 'string') {
      throw new Error('Client Secret is required and must be a string')
    }

    // Validate format (no newlines or control characters in required fields)
    if (/[\r\n\x00-\x1f]/.test(credentials.clientId)) {
      throw new Error('Client ID contains invalid characters')
    }

    if (/[\r\n\x00-\x1f]/.test(credentials.clientSecret)) {
      throw new Error('Client Secret contains invalid characters')
    }
  }

  /**
   * Sanitize a value for .env file
   * @param {string} value - Value to sanitize
   * @returns {string} Sanitized value
   */
  _sanitizeValue(value) {
    if (!value) return value

    // Remove control characters except tabs
    return String(value)
      .replace(/[\r\n\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')
      .trim()
  }
}
