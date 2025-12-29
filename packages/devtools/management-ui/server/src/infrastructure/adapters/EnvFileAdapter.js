import fs from 'fs/promises'
import path from 'path'

const ENV_FILE_PATTERNS = ['.env', '.env.local', 'backend/.env', 'backend/.env.local']

/**
 * EnvFileAdapter
 * Infrastructure adapter for reading and writing .env files
 * Extends the EnvFileReader capabilities with write functionality
 *
 * Follows the pattern: module name -> env var prefix
 * Example: hubspot -> HUBSPOT_CLIENT_ID, HUBSPOT_CLIENT_SECRET, HUBSPOT_SCOPE
 */
export class EnvFileAdapter {
  constructor({ allowedBasePaths = [] } = {}) {
    this._allowedBasePaths = allowedBasePaths.map(p => path.resolve(p))
  }

  /**
   * Validate repository path for security
   * @param {string} repositoryPath - Path to validate
   * @returns {string} Canonical path
   */
  validatePath(repositoryPath) {
    if (!repositoryPath || typeof repositoryPath !== 'string') {
      throw new Error('Invalid repository path')
    }

    const canonicalPath = path.resolve(repositoryPath)

    // If allowed base paths configured, enforce them
    if (this._allowedBasePaths.length > 0) {
      const isAllowed = this._allowedBasePaths.some(base =>
        canonicalPath.startsWith(base + path.sep) || canonicalPath === base
      )
      if (!isAllowed) {
        throw new Error('Repository path outside allowed directories')
      }
    }

    // Block obvious traversal attempts
    if (repositoryPath.includes('..')) {
      throw new Error('Path traversal not allowed')
    }

    return canonicalPath
  }

  /**
   * Get possible .env file paths for a repository
   * @param {string} repositoryPath - Repository root path
   * @returns {string[]} Array of possible .env file paths
   */
  getEnvPaths(repositoryPath) {
    const canonicalPath = this.validatePath(repositoryPath)
    return ENV_FILE_PATTERNS.map(pattern => path.join(canonicalPath, pattern))
  }

  /**
   * Read and parse an .env file
   * @param {string} filePath - Path to .env file
   * @returns {Promise<object|null>} Parsed env variables or null if not found
   */
  async readEnvFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      return this.parseEnvContent(content)
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
        return null
      }
      if (error.code === 'EACCES' || error.code === 'EPERM') {
        return null // Permission denied - treat as not found
      }
      throw error
    }
  }

  /**
   * Parse .env file content into object
   * @param {string} content - Raw .env file content
   * @returns {object} Parsed key-value pairs
   */
  parseEnvContent(content) {
    const env = {}

    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue

      const eqIdx = trimmed.indexOf('=')
      if (eqIdx <= 0) continue

      const key = trimmed.substring(0, eqIdx).trim()
      let value = trimmed.substring(eqIdx + 1).trim()

      // Remove quotes
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }

      env[key] = value
    }

    return env
  }

  /**
   * Find the primary .env file path for a repository
   * Prefers backend/.env over root .env
   * @param {string} repositoryPath - Repository root path
   * @returns {Promise<string|null>} Path to existing .env file or best candidate
   */
  async findPrimaryEnvFile(repositoryPath) {
    const envPaths = this.getEnvPaths(repositoryPath)

    // Check each path in order, return first existing file
    for (const envPath of envPaths) {
      try {
        await fs.access(envPath)
        return envPath
      } catch {
        // File doesn't exist, continue
      }
    }

    // No existing file, return backend/.env as the preferred location
    // This matches the Frigg project structure
    const canonicalPath = this.validatePath(repositoryPath)
    const backendEnvPath = path.join(canonicalPath, 'backend', '.env')

    // Check if backend directory exists
    try {
      await fs.access(path.join(canonicalPath, 'backend'))
      return backendEnvPath
    } catch {
      // No backend directory, use root .env
      return path.join(canonicalPath, '.env')
    }
  }

  /**
   * Get OAuth credential env var names for a module
   * @param {string} moduleName - Module name (e.g., 'hubspot', 'salesforce')
   * @returns {object} Object with clientId, clientSecret, scope var names
   */
  getOAuthEnvVarNames(moduleName) {
    const prefix = moduleName.toUpperCase().replace(/-/g, '_')
    return {
      clientId: `${prefix}_CLIENT_ID`,
      clientSecret: `${prefix}_CLIENT_SECRET`,
      scope: `${prefix}_SCOPE`
    }
  }

  /**
   * Check if OAuth credentials are configured for a module
   * @param {string} repositoryPath - Repository root path
   * @param {string} moduleName - Module name
   * @returns {Promise<object>} Status of OAuth credentials
   */
  async checkOAuthCredentials(repositoryPath, moduleName) {
    const varNames = this.getOAuthEnvVarNames(moduleName)
    const envPaths = this.getEnvPaths(repositoryPath)

    const result = {
      moduleName,
      varNames,
      values: {
        clientId: null,
        clientSecret: null,
        scope: null
      },
      missing: [],
      complete: false
    }

    // Check all env files for the credentials
    for (const envPath of envPaths) {
      const env = await this.readEnvFile(envPath)
      if (!env) continue

      if (env[varNames.clientId] && !result.values.clientId) {
        result.values.clientId = env[varNames.clientId]
      }
      if (env[varNames.clientSecret] && !result.values.clientSecret) {
        result.values.clientSecret = env[varNames.clientSecret]
      }
      if (env[varNames.scope] && !result.values.scope) {
        result.values.scope = env[varNames.scope]
      }
    }

    // Determine what's missing (clientId and clientSecret are required, scope is optional)
    if (!result.values.clientId) {
      result.missing.push('clientId')
    }
    if (!result.values.clientSecret) {
      result.missing.push('clientSecret')
    }

    result.complete = result.missing.length === 0

    return result
  }

  /**
   * Write OAuth credentials to .env file
   * @param {string} repositoryPath - Repository root path
   * @param {string} moduleName - Module name
   * @param {object} credentials - OAuth credentials
   * @param {string} credentials.clientId - OAuth client ID
   * @param {string} credentials.clientSecret - OAuth client secret
   * @param {string} [credentials.scope] - OAuth scope (optional)
   * @returns {Promise<object>} Result of write operation
   */
  async writeOAuthCredentials(repositoryPath, moduleName, credentials) {
    const varNames = this.getOAuthEnvVarNames(moduleName)
    const envFilePath = await this.findPrimaryEnvFile(repositoryPath)

    // Read existing content
    let existingContent = ''
    try {
      existingContent = await fs.readFile(envFilePath, 'utf-8')
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error
      }
      // File doesn't exist, we'll create it
    }

    // Create backup before modifying
    if (existingContent) {
      await this.createBackup(envFilePath)
    }

    // Parse existing content to preserve other variables
    const existingVars = this.parseEnvContent(existingContent)

    // Update with new credentials
    if (credentials.clientId) {
      existingVars[varNames.clientId] = credentials.clientId
    }
    if (credentials.clientSecret) {
      existingVars[varNames.clientSecret] = credentials.clientSecret
    }
    if (credentials.scope) {
      existingVars[varNames.scope] = credentials.scope
    }

    // Rebuild content preserving comments and structure where possible
    const newContent = this.rebuildEnvContent(existingContent, existingVars, varNames)

    // Ensure directory exists
    const envDir = path.dirname(envFilePath)
    await fs.mkdir(envDir, { recursive: true })

    // Write the updated file
    await fs.writeFile(envFilePath, newContent, 'utf-8')

    return {
      success: true,
      path: envFilePath,
      written: {
        [varNames.clientId]: !!credentials.clientId,
        [varNames.clientSecret]: !!credentials.clientSecret,
        [varNames.scope]: !!credentials.scope
      }
    }
  }

  /**
   * Rebuild .env content preserving structure and adding new vars
   * @param {string} existingContent - Original file content
   * @param {object} vars - All variables to include
   * @param {object} newVarNames - Names of new variables being added
   * @returns {string} New file content
   */
  rebuildEnvContent(existingContent, vars, newVarNames) {
    const lines = existingContent ? existingContent.split('\n') : []
    const writtenKeys = new Set()
    const result = []

    // First pass: update existing lines
    for (const line of lines) {
      const trimmed = line.trim()

      // Preserve comments and empty lines
      if (!trimmed || trimmed.startsWith('#')) {
        result.push(line)
        continue
      }

      const eqIdx = trimmed.indexOf('=')
      if (eqIdx <= 0) {
        result.push(line)
        continue
      }

      const key = trimmed.substring(0, eqIdx).trim()

      if (key in vars) {
        // Update this variable
        result.push(`${key}=${this.escapeValue(vars[key])}`)
        writtenKeys.add(key)
      } else {
        // Keep the line as-is
        result.push(line)
      }
    }

    // Second pass: add new variables that weren't in the file
    const newVars = []
    for (const [key, value] of Object.entries(vars)) {
      if (!writtenKeys.has(key)) {
        newVars.push(`${key}=${this.escapeValue(value)}`)
      }
    }

    if (newVars.length > 0) {
      // Add a blank line before new vars if content exists
      if (result.length > 0 && result[result.length - 1].trim() !== '') {
        result.push('')
      }

      // Add comment for new OAuth credentials section
      const isOAuthVars = Object.values(newVarNames).some(name =>
        newVars.some(v => v.startsWith(`${name}=`))
      )
      if (isOAuthVars) {
        result.push(`# OAuth credentials`)
      }

      result.push(...newVars)
    }

    return result.join('\n')
  }

  /**
   * Escape value for .env file format
   * @param {string} value - Value to escape
   * @returns {string} Escaped value
   */
  escapeValue(value) {
    if (value === null || value === undefined) {
      return ''
    }
    const strValue = String(value)
    // If value contains spaces, newlines, or special chars, wrap in quotes
    if (/[\s"'`#$]/.test(strValue) || strValue === '') {
      const escaped = strValue.replace(/"/g, '\\"')
      return `"${escaped}"`
    }
    return strValue
  }

  /**
   * Create a backup of the .env file
   * @param {string} filePath - Path to file to backup
   */
  async createBackup(filePath) {
    const backupPath = `${filePath}.backup.${Date.now()}`
    try {
      await fs.copyFile(filePath, backupPath)

      // Clean up old backups (keep last 5)
      await this.cleanupOldBackups(filePath)
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error
      }
    }
  }

  /**
   * Clean up old backup files
   * @param {string} filePath - Original file path
   */
  async cleanupOldBackups(filePath) {
    const dir = path.dirname(filePath)
    const basename = path.basename(filePath)
    const backupPattern = new RegExp(`^${basename.replace('.', '\\.')}\\.backup\\.\\d+$`)

    try {
      const files = await fs.readdir(dir)
      const backups = files
        .filter(f => backupPattern.test(f))
        .map(f => ({
          name: f,
          path: path.join(dir, f),
          timestamp: parseInt(f.split('.').pop())
        }))
        .sort((a, b) => b.timestamp - a.timestamp)

      // Delete old backups beyond the first 5
      for (let i = 5; i < backups.length; i++) {
        await fs.unlink(backups[i].path)
      }
    } catch (error) {
      // Ignore errors during cleanup
      console.warn('Failed to cleanup old backups:', error.message)
    }
  }

  /**
   * Read a specific variable from .env files
   * @param {string} repositoryPath - Repository root path
   * @param {string} varName - Variable name
   * @returns {Promise<string|null>} Variable value or null
   */
  async readVariable(repositoryPath, varName) {
    const envPaths = this.getEnvPaths(repositoryPath)

    for (const envPath of envPaths) {
      const env = await this.readEnvFile(envPath)
      if (env?.[varName]) {
        return env[varName]
      }
    }

    return null
  }
}
