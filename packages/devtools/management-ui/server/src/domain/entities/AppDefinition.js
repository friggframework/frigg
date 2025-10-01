import { EntityValidationError } from '../errors/EntityValidationError.js'

/**
 * Application Definition entity
 * Represents the application configuration and metadata
 */
export class AppDefinition {
  constructor({
    name,
    label,
    version,
    description,
    modules = [],
    routes = [],
    config = {},
    packageName = null
  }) {
    this.name = name
    this.label = label
    this.version = version
    this.description = description
    this.modules = modules
    this.routes = routes
    this.config = config
    this.packageName = packageName
    this.createdAt = new Date()
    this.updatedAt = new Date()

    this.validate()
  }

  static create(props) {
    return new AppDefinition(props)
  }

  validate() {
    // Name validation with fallback logic
    if (!this.name && !this.packageName) {
      throw new EntityValidationError('AppDefinition must have either a name or packageName')
    }

    // If name is provided, validate its format (kebab-case, lowercase)
    if (this.name && typeof this.name === 'string') {
      const namePattern = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/
      if (!namePattern.test(this.name)) {
        throw new EntityValidationError('AppDefinition name must be kebab-case (lowercase, no spaces)')
      }
    }

    // Label validation (optional, human-readable)
    if (this.label && typeof this.label !== 'string') {
      throw new EntityValidationError('AppDefinition label must be a string')
    }

    if (!this.version || typeof this.version !== 'string') {
      throw new EntityValidationError('AppDefinition must have a valid version')
    }

    if (this.description && typeof this.description !== 'string') {
      throw new EntityValidationError('AppDefinition description must be a string')
    }

    if (!Array.isArray(this.modules)) {
      throw new EntityValidationError('AppDefinition modules must be an array')
    }

    if (!Array.isArray(this.routes)) {
      throw new EntityValidationError('AppDefinition routes must be an array')
    }

    if (typeof this.config !== 'object' || this.config === null) {
      throw new EntityValidationError('AppDefinition config must be an object')
    }
  }

  /**
   * Get the display name for the application
   * Uses label if available, falls back to name, then to packageName
   */
  getDisplayName() {
    if (this.label) return this.label
    if (this.name) return this.name
    if (this.packageName) return this.packageName
    return 'Unknown Application'
  }

  /**
   * Get the identifier for the application
   * Uses name if available, falls back to packageName
   */
  getIdentifier() {
    if (this.name) return this.name
    if (this.packageName) return this.packageName
    return 'unknown-app'
  }

  addModule(module) {
    if (!module || typeof module !== 'object') {
      throw new EntityValidationError('Module must be a valid object')
    }

    this.modules.push(module)
    this.updatedAt = new Date()
  }

  removeModule(moduleName) {
    const index = this.modules.findIndex(m => m.name === moduleName)
    if (index !== -1) {
      this.modules.splice(index, 1)
      this.updatedAt = new Date()
    }
  }

  addRoute(route) {
    if (!route || typeof route !== 'object') {
      throw new EntityValidationError('Route must be a valid object')
    }

    this.routes.push(route)
    this.updatedAt = new Date()
  }

  updateConfig(newConfig) {
    if (typeof newConfig !== 'object' || newConfig === null) {
      throw new EntityValidationError('Config must be an object')
    }

    this.config = { ...this.config, ...newConfig }
    this.updatedAt = new Date()
  }

  toJSON() {
    return {
      name: this.name,
      version: this.version,
      description: this.description,
      modules: this.modules,
      routes: this.routes,
      config: this.config,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    }
  }
}