import fs from 'fs/promises'
import path from 'path'

/**
 * EnvFileReader
 * Utility for reading environment variables from .env files
 */
export class EnvFileReader {
  /**
   * Read and parse a .env file
   * @param {string} filePath - Path to the .env file
   * @returns {Promise<object>} Parsed environment variables
   */
  async readEnvFile(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      return this.parseEnvContent(content)
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null // File doesn't exist
      }
      throw error
    }
  }

  /**
   * Parse .env file content into an object
   * @param {string} content - Raw .env file content
   * @returns {object} Parsed environment variables
   */
  parseEnvContent(content) {
    const env = {}
    const lines = content.split('\n')

    for (const line of lines) {
      // Skip empty lines and comments
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) {
        continue
      }

      // Parse KEY=VALUE format
      const equalIndex = trimmed.indexOf('=')
      if (equalIndex === -1) {
        continue
      }

      const key = trimmed.substring(0, equalIndex).trim()
      let value = trimmed.substring(equalIndex + 1).trim()

      // Remove surrounding quotes if present
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1)
      }

      // Handle escaped characters in double-quoted strings
      if (trimmed.substring(equalIndex + 1).trim().startsWith('"')) {
        value = value.replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\t/g, '\t')
          .replace(/\\\\/g, '\\')
      }

      env[key] = value
    }

    return env
  }

  /**
   * Read a specific variable from a repository's .env file
   * @param {string} repositoryPath - Path to the repository
   * @param {string} varName - Name of the variable to read
   * @returns {Promise<string|null>} Variable value or null if not found
   */
  async readVariable(repositoryPath, varName) {
    // Try multiple possible .env file locations
    const envPaths = [
      path.join(repositoryPath, '.env'),
      path.join(repositoryPath, '.env.local'),
      path.join(repositoryPath, 'backend', '.env'),
      path.join(repositoryPath, 'backend', '.env.local')
    ]

    for (const envPath of envPaths) {
      const env = await this.readEnvFile(envPath)
      if (env && env[varName]) {
        return env[varName]
      }
    }

    return null
  }

  /**
   * Read FRIGG_ADMIN_API_KEY from a repository's .env file
   * @param {string} repositoryPath - Path to the repository
   * @returns {Promise<string|null>} Admin API key or null if not found
   */
  async readAdminApiKey(repositoryPath) {
    return this.readVariable(repositoryPath, 'FRIGG_ADMIN_API_KEY')
  }
}
