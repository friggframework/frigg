/**
 * Integration Domain Entity
 * Represents an integration in the system with its core properties and business rules
 */
export class Integration {
  constructor({
    name,
    displayName,
    description,
    category,
    type,
    status,
    version,
    modules = [],
    config = {},
    options = {},
    metadata = {}
  }) {
    this.validateRequiredFields({ name, type })

    this.name = name
    this.displayName = displayName || name
    this.description = description
    this.category = category
    this.type = type
    this.status = status || 'inactive'
    this.version = version
    this.modules = modules
    this.config = config
    this.options = options
    this.metadata = metadata
  }

  validateRequiredFields({ name, type }) {
    if (!name || typeof name !== 'string') {
      throw new Error('Integration name is required and must be a string')
    }
    if (!type || typeof type !== 'string') {
      throw new Error('Integration type is required and must be a string')
    }
  }

  /**
   * Check if integration is active
   */
  isActive() {
    return this.status === 'active'
  }

  /**
   * Check if integration has modules
   */
  hasModules() {
    return this.modules && this.modules.length > 0
  }

  /**
   * Get configuration value by key
   */
  getConfigValue(key) {
    return this.config[key]
  }

  /**
   * Get option value by key
   */
  getOptionValue(key) {
    return this.options[key]
  }

  /**
   * Update status with validation
   */
  updateStatus(newStatus) {
    const validStatuses = ['active', 'inactive', 'error', 'pending']
    if (!validStatuses.includes(newStatus)) {
      throw new Error(`Invalid status: ${newStatus}. Must be one of: ${validStatuses.join(', ')}`)
    }
    this.status = newStatus
  }

  /**
   * Clone the integration
   */
  clone() {
    return new Integration({
      name: this.name,
      displayName: this.displayName,
      description: this.description,
      category: this.category,
      type: this.type,
      status: this.status,
      version: this.version,
      modules: [...this.modules],
      config: { ...this.config },
      options: { ...this.options },
      metadata: { ...this.metadata }
    })
  }

  /**
   * Convert to plain object
   */
  toObject() {
    return {
      name: this.name,
      displayName: this.displayName,
      description: this.description,
      category: this.category,
      type: this.type,
      status: this.status,
      version: this.version,
      modules: this.modules,
      config: this.config,
      options: this.options,
      metadata: this.metadata
    }
  }

  /**
   * Create from plain object
   */
  static fromObject(obj) {
    return new Integration(obj)
  }
}