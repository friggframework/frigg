import fs from 'fs/promises'
import path from 'path'

const ENV_FILE_PATTERNS = ['.env', '.env.local', 'backend/.env', 'backend/.env.local']

export class EnvFileReader {
  constructor({ allowedBasePaths = [] } = {}) {
    this._allowedBasePaths = allowedBasePaths.map(p => path.resolve(p))
  }

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

  getEnvPaths(repositoryPath) {
    const canonicalPath = this.validatePath(repositoryPath)
    return ENV_FILE_PATTERNS.map(pattern => path.join(canonicalPath, pattern))
  }

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

  async readAdminApiKey(repositoryPath) {
    // Try FRIGG_ADMIN_API_KEY first, fall back to ADMIN_API_KEY for backwards compatibility
    const key = await this.readVariable(repositoryPath, 'FRIGG_ADMIN_API_KEY')
    if (key) return key
    return this.readVariable(repositoryPath, 'ADMIN_API_KEY')
  }

  async readSharedSecret(repositoryPath) {
    return this.readVariable(repositoryPath, 'FRIGG_API_KEY')
  }
}
