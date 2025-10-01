/**
 * APIModule Entity
 * Represents an API module that can be used by integrations
 * Modules export a Definition that contains metadata and auth methods
 */
export class APIModule {
  constructor({
    id,
    name,           // From config.name (e.g., "hubspot")
    label,          // From config.label (e.g., "HubSpot")
    modelName,      // From Definition.modelName (e.g., "HubSpot")
    description,
    categories = [],
    version,
    packageName,    // NPM package name (e.g., "@friggframework/api-module-hubspot")
    source = 'npm', // 'npm' or 'local'
    path = null,    // For local modules
    isInstalled = false,
    installedVersion = null,

    // From defaultConfig.json
    productUrl = null,
    apiDocs = null,
    logoUrl = null,

    // From Definition
    requiredAuthMethods = {},
    env = {},

    // Module capabilities
    requiredScopes = []
  }) {
    this.id = id || name
    this.name = name
    this.label = label // Use label as provided, no formatting
    this.modelName = modelName
    this.description = description
    this.categories = categories
    this.version = version
    this.packageName = packageName
    this.source = source
    this.path = path
    this.isInstalled = isInstalled
    this.installedVersion = installedVersion

    // URLs and documentation
    this.productUrl = productUrl
    this.apiDocs = apiDocs
    this.logoUrl = logoUrl

    // Auth configuration
    this.requiredAuthMethods = requiredAuthMethods
    this.env = env
    this.requiredScopes = requiredScopes
  }

  detectOAuthSupport() {
    return !!(this.requiredAuthMethods.getToken ||
              this.env.client_id ||
              this.env.client_secret)
  }

  detectApiKeySupport() {
    return !!(this.requiredAuthMethods.getApiKey ||
              this.env.api_key)
  }

  // Domain methods
  isNpmModule() {
    return this.source === 'npm'
  }

  isLocalModule() {
    return this.source === 'local'
  }

  canInstall() {
    return this.isNpmModule() && !this.isInstalled
  }

  canUpdate() {
    return this.isNpmModule() &&
           this.isInstalled &&
           this.version !== this.installedVersion
  }

  canRemove() {
    return this.isInstalled
  }

  markAsInstalled(version) {
    this.isInstalled = true
    this.installedVersion = version || this.version
  }

  markAsRemoved() {
    this.isInstalled = false
    this.installedVersion = null
  }

  // Generate require statement for use in integration
  getRequireStatement() {
    if (this.isNpmModule()) {
      return `const ${this.name} = require('${this.packageName}');`
    } else {
      return `const ${this.name} = require('${this.path}');`
    }
  }

  // Get environment variable requirements directly from Definition.env
  getRequiredEnvVars() {
    // Return the env object keys as they are defined in the module's Definition
    // e.g., if env has { client_id: process.env.HUBSPOT_CLIENT_ID }
    // we extract the env var names from the values
    const envVars = []

    Object.entries(this.env).forEach(([key, value]) => {
      if (typeof value === 'string' && value.startsWith('process.env.')) {
        const envVarName = value.replace('process.env.', '')
        envVars.push(envVarName)
      }
    })

    return envVars
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      label: this.label,
      modelName: this.modelName,
      description: this.description,
      categories: this.categories,
      version: this.version,
      packageName: this.packageName,
      source: this.source,
      path: this.path,
      isInstalled: this.isInstalled,
      installedVersion: this.installedVersion,
      productUrl: this.productUrl,
      apiDocs: this.apiDocs,
      logoUrl: this.logoUrl,
      supportsOAuth: this.detectOAuthSupport(),
      supportsApiKey: this.detectApiKeySupport(),
      requiredEnvVars: this.getRequiredEnvVars()
    }
  }

  static createFromNpmPackage(packageInfo, definition, config) {
    return new APIModule({
      name: config?.name || definition?.moduleName,
      label: config?.label, // Use label exactly as defined
      modelName: definition?.modelName,
      description: config?.description || packageInfo.description,
      categories: config?.categories || [],
      version: packageInfo.version,
      packageName: packageInfo.name,
      source: 'npm',
      productUrl: config?.productUrl,
      apiDocs: config?.apiDocs,
      logoUrl: config?.logoUrl,
      requiredAuthMethods: definition?.requiredAuthMethods || {},
      env: definition?.env || {}
    })
  }

  static createLocal(name, path, definition) {
    return new APIModule({
      name: definition?.moduleName || name,
      label: definition?.getName?.() || name, // Use getName() or fallback
      modelName: definition?.modelName,
      path,
      source: 'local',
      isInstalled: true,
      version: '1.0.0',
      requiredAuthMethods: definition?.requiredAuthMethods || {},
      env: definition?.env || {}
    })
  }
}