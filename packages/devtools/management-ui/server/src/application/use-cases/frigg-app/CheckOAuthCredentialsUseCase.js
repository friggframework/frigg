/**
 * CheckOAuthCredentialsUseCase
 * Application use case for checking if OAuth credentials are configured for a module
 *
 * This use case checks the .env file(s) in a Frigg app repository to determine
 * if the required OAuth credentials (CLIENT_ID, CLIENT_SECRET, SCOPE) are present.
 *
 * Business rules:
 * - CLIENT_ID and CLIENT_SECRET are required for OAuth flow
 * - SCOPE is optional but recommended
 * - Returns detailed status to allow UI to prompt for missing credentials
 */
export class CheckOAuthCredentialsUseCase {
  /**
   * @param {object} params
   * @param {EnvFileAdapter} params.envFileAdapter - Adapter for reading .env files
   */
  constructor({ envFileAdapter }) {
    this._envFileAdapter = envFileAdapter
  }

  /**
   * Execute the use case
   * @param {object} params
   * @param {string} params.repositoryPath - Path to the Frigg app repository
   * @param {string} params.moduleName - Name of the module (e.g., 'hubspot', 'salesforce')
   * @returns {Promise<object>} Credentials status
   */
  async execute({ repositoryPath, moduleName }) {
    if (!repositoryPath) {
      throw new Error('Repository path is required')
    }

    if (!moduleName) {
      throw new Error('Module name is required')
    }

    // Normalize module name (lowercase, no special chars)
    const normalizedModuleName = moduleName.toLowerCase().replace(/[^a-z0-9-_]/g, '')

    // Check credentials via adapter
    const credentialsStatus = await this._envFileAdapter.checkOAuthCredentials(
      repositoryPath,
      normalizedModuleName
    )

    // Build response with additional context
    return {
      moduleName: normalizedModuleName,
      complete: credentialsStatus.complete,
      missing: credentialsStatus.missing,
      envVarNames: credentialsStatus.varNames,
      hasClientId: !!credentialsStatus.values.clientId,
      hasClientSecret: !!credentialsStatus.values.clientSecret,
      hasScope: !!credentialsStatus.values.scope,
      // Don't return actual values for security
      message: this._buildStatusMessage(credentialsStatus)
    }
  }

  /**
   * Build a human-readable status message
   * @param {object} status - Credentials status
   * @returns {string} Status message
   */
  _buildStatusMessage(status) {
    if (status.complete) {
      return 'OAuth credentials are configured'
    }

    const missingItems = []
    if (status.missing.includes('clientId')) {
      missingItems.push(`${status.varNames.clientId}`)
    }
    if (status.missing.includes('clientSecret')) {
      missingItems.push(`${status.varNames.clientSecret}`)
    }

    return `Missing required OAuth credentials: ${missingItems.join(', ')}`
  }
}
