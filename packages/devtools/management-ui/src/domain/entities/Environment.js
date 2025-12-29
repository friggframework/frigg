/**
 * Environment Entity
 * Represents an environment configuration with business logic and validation
 */
export class Environment {
  constructor(data) {
    this.id = data.id
    this.name = data.name
    this.type = data.type || 'development' // development, staging, production
    this.isActive = data.isActive !== undefined ? data.isActive : true
    this.config = data.config || {}
    this.variables = data.variables || {}
    this.secrets = data.secrets || {}
    this.createdAt = data.createdAt || new Date()
    this.updatedAt = data.updatedAt || new Date()
    this.lastDeployedAt = data.lastDeployedAt || null
  }

  /**
   * Check if environment is active
   * @returns {boolean}
   */
  isActive() {
    return this.isActive
  }

  /**
   * Check if environment is production
   * @returns {boolean}
   */
  isProduction() {
    return this.type === 'production'
  }

  /**
   * Check if environment is development
   * @returns {boolean}
   */
  isDevelopment() {
    return this.type === 'development'
  }

  /**
   * Update environment configuration
   * @param {Object} config
   */
  updateConfig(config) {
    this.config = { ...this.config, ...config }
    this.updatedAt = new Date()
  }

  /**
   * Set environment variable
   * @param {string} key
   * @param {string} value
   */
  setVariable(key, value) {
    this.variables[key] = value
    this.updatedAt = new Date()
  }

  /**
   * Get environment variable
   * @param {string} key
   * @returns {string|undefined}
   */
  getVariable(key) {
    return this.variables[key]
  }

  /**
   * Set secret
   * @param {string} key
   * @param {string} value
   */
  setSecret(key, value) {
    this.secrets[key] = value
    this.updatedAt = new Date()
  }

  /**
   * Get secret (returns masked value for security)
   * @param {string} key
   * @returns {string|undefined}
   */
  getSecret(key) {
    const value = this.secrets[key]
    return value ? '***' : undefined
  }

  /**
   * Activate environment
   */
  activate() {
    this.isActive = true
    this.updatedAt = new Date()
  }

  /**
   * Deactivate environment
   */
  deactivate() {
    this.isActive = false
    this.updatedAt = new Date()
  }

  /**
   * Record deployment
   */
  recordDeployment() {
    this.lastDeployedAt = new Date()
    this.updatedAt = new Date()
  }

  /**
   * Validate environment data
   * @returns {boolean}
   */
  isValid() {
    return !!(this.id && this.name && this.type)
  }

  /**
   * Get environment display name
   * @returns {string}
   */
  getDisplayName() {
    return `${this.name} (${this.type})`
  }

  /**
   * Convert to plain object (excludes secrets for security)
   * @returns {Object}
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      type: this.type,
      isActive: this.isActive,
      config: this.config,
      variables: this.variables,
      secrets: Object.keys(this.secrets), // Only return keys, not values
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      lastDeployedAt: this.lastDeployedAt
    }
  }
}
