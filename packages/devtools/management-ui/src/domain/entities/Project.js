/**
 * Project Domain Entity
 * Represents a Frigg project/repository
 */
export class Project {
  constructor({
    name,
    path,
    version,
    friggCoreVersion,
    packageJson = {},
    integrations = [],
    status = 'stopped',
    metadata = {}
  }) {
    this.validateRequiredFields({ name, path })

    this.name = name
    this.path = path
    this.version = version
    this.friggCoreVersion = friggCoreVersion
    this.packageJson = packageJson
    this.integrations = integrations
    this.status = status
    this.metadata = metadata
  }

  validateRequiredFields({ name, path }) {
    if (!name || typeof name !== 'string') {
      throw new Error('Project name is required and must be a string')
    }
    if (!path || typeof path !== 'string') {
      throw new Error('Project path is required and must be a string')
    }
  }

  /**
   * Check if project is running
   */
  isRunning() {
    return this.status === 'running'
  }

  /**
   * Check if project has integrations
   */
  hasIntegrations() {
    return this.integrations && this.integrations.length > 0
  }

  /**
   * Get integration count
   */
  getIntegrationCount() {
    return this.integrations.length
  }

  /**
   * Update status with validation
   */
  updateStatus(newStatus) {
    const validStatuses = ['running', 'stopped', 'starting', 'stopping', 'error']
    if (!validStatuses.includes(newStatus)) {
      throw new Error(`Invalid status: ${newStatus}. Must be one of: ${validStatuses.join(', ')}`)
    }
    this.status = newStatus
  }

  /**
   * Add integration
   */
  addIntegration(integration) {
    if (!this.integrations.find(i => i.name === integration.name)) {
      this.integrations.push(integration)
    }
  }

  /**
   * Remove integration
   */
  removeIntegration(integrationName) {
    this.integrations = this.integrations.filter(i => i.name !== integrationName)
  }

  /**
   * Convert to plain object
   */
  toObject() {
    return {
      name: this.name,
      path: this.path,
      version: this.version,
      friggCoreVersion: this.friggCoreVersion,
      packageJson: this.packageJson,
      integrations: this.integrations.map(i => i.toObject ? i.toObject() : i),
      status: this.status,
      metadata: this.metadata
    }
  }

  /**
   * Create from plain object
   */
  static fromObject(obj) {
    return new Project(obj)
  }
}