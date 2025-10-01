import { IntegrationStatus } from '../value-objects/IntegrationStatus.js'

/**
 * Integration Entity
 * Represents an integration class definition in the Frigg project codebase
 * Uses one or more API modules to implement workflows and event handlers
 */
export class Integration {
  constructor({
    id,
    name,           // From Definition.name (e.g., "creditorwatch")
    className,      // Class name (e.g., "CreditorWatchIntegration")
    version = '1.0.0',
    supportedVersions = [],
    hasUserConfig = false,

    // Display configuration
    display = {},

    // API Modules used
    modules = {},   // Map of module name to module definition

    // Routes and events
    routes = [],    // Route definitions mapping paths to events
    events = [],    // Event handlers

    // File system
    path = null,    // Path to integration file in project

    // Status
    status = IntegrationStatus.ACTIVE
  }) {
    this.id = id || name
    this.name = name
    this.className = className || this.generateClassName(name)
    this.version = version
    this.supportedVersions = supportedVersions
    this.hasUserConfig = hasUserConfig

    // Display properties - use exactly as provided
    this.display = {
      label: display.label,
      description: display.description,
      category: display.category,
      detailsUrl: display.detailsUrl,
      icon: display.icon
    }

    // Modules, routes, events
    this.modules = modules
    this.routes = routes
    this.events = events

    // File system
    this.path = path

    // Status
    this.status = status instanceof IntegrationStatus ? status : new IntegrationStatus(status)
  }

  generateClassName(name) {
    // Convert name to PascalCase and append 'Integration'
    return name.split(/[-_]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('') + 'Integration'
  }

  // Domain methods
  getModuleNames() {
    return Object.keys(this.modules)
  }

  hasModule(moduleName) {
    return moduleName in this.modules
  }

  addModule(moduleName, moduleDefinition) {
    if (!this.hasModule(moduleName)) {
      this.modules[moduleName] = {
        definition: moduleDefinition
      }
      return true
    }
    return false
  }

  removeModule(moduleName) {
    if (this.hasModule(moduleName)) {
      delete this.modules[moduleName]
      return true
    }
    return false
  }

  addRoute(route) {
    this.routes.push(route)
  }

  removeRoute(path, method) {
    const initialLength = this.routes.length
    this.routes = this.routes.filter(r =>
      !(r.path === path && r.method === method)
    )

    return this.routes.length !== initialLength
  }

  getEventNames() {
    return this.routes.map(r => r.event).filter(Boolean)
  }

  updateDisplay(displayConfig) {
    this.display = { ...this.display, ...displayConfig }
  }

  // Generate the integration class code
  generateClassCode() {
    const moduleRequires = Object.keys(this.modules)
      .map(name => `const ${name} = require('../api-modules/${name}');`)
      .join('\n')

    return `const { IntegrationBase } = require('@friggframework/core');
${moduleRequires}

class ${this.className} extends IntegrationBase {
    static Definition = {
        name: '${this.name}',
        version: '${this.version}',
        supportedVersions: ${JSON.stringify(this.supportedVersions)},
        hasUserConfig: ${this.hasUserConfig},

        display: ${JSON.stringify(this.display, null, 8)},

        modules: {
            ${Object.entries(this.modules).map(([name, module]) =>
              `${name}: {\n                definition: ${name}.Definition,\n            }`
            ).join(',\n            ')}
        },

        routes: ${JSON.stringify(this.routes, null, 8)},
    };

    constructor() {
        super();
        this.events = {
            ${this.getEventNames().map(event =>
              `${event}: {\n                handler: this.${this.eventToMethodName(event)}.bind(this),\n            }`
            ).join(',\n            ')}
        };
    }

    ${this.getEventNames().map(event =>
      `async ${this.eventToMethodName(event)}({ req, res }) {\n        // TODO: Implement ${event} handler\n    }`
    ).join('\n    \n    ')}
}

module.exports = ${this.className};
`
  }

  eventToMethodName(eventName) {
    // Convert EVENT_NAME to eventName
    return eventName.toLowerCase()
      .split('_')
      .map((word, index) =>
        index === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1)
      )
      .join('')
  }

  // Check if integration is properly configured
  isConfigured() {
    return Object.keys(this.modules).length > 0 &&
           this.routes.length > 0
  }

  canBeDeleted() {
    return !this.status.isTransitioning()
  }

  // Get required environment variables from all modules
  getRequiredEnvVars() {
    const envVars = new Set()

    // Collect env vars from each module's Definition.env
    // The modules would have their env requirements stored
    Object.values(this.modules).forEach(module => {
      if (module.definition?.env) {
        Object.values(module.definition.env).forEach(value => {
          // Extract env var names from process.env.VARIABLE_NAME
          if (typeof value === 'string' && value.includes('process.env.')) {
            const envVar = value.replace('process.env.', '').split(/[^A-Z0-9_]/)[0]
            if (envVar) {
              envVars.add(envVar)
            }
          }
        })
      }
    })

    // REDIRECT_URI is typically always needed for OAuth integrations
    if (this.routes.some(r => r.path === '/auth')) {
      envVars.add('REDIRECT_URI')
    }

    return Array.from(envVars)
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      className: this.className,
      version: this.version,
      supportedVersions: this.supportedVersions,
      hasUserConfig: this.hasUserConfig,
      display: this.display,
      modules: this.modules,
      routes: this.routes,
      events: this.getEventNames(),
      path: this.path,
      status: this.status.toString(),
      isConfigured: this.isConfigured(),
      requiredEnvVars: this.getRequiredEnvVars()
    }
  }

  static create(data) {
    if (!data.name) {
      throw new Error('Integration name is required')
    }
    return new Integration(data)
  }

  // Create from parsed integration class
  static fromIntegrationClass(IntegrationClass) {
    const definition = IntegrationClass.Definition || {}

    return new Integration({
      name: definition.name,
      className: IntegrationClass.name,
      version: definition.version || '1.0.0',
      supportedVersions: definition.supportedVersions || [],
      hasUserConfig: definition.hasUserConfig || false,
      display: definition.display || {},
      modules: definition.modules || {},
      routes: definition.routes || [],
      status: IntegrationStatus.ACTIVE
    })
  }
}