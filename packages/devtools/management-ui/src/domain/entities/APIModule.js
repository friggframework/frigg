/**
 * APIModule Entity
 * Represents an API module with business logic and validation
 */
export class APIModule {
    constructor(data) {
        this.id = data.id
        this.name = data.name
        this.version = data.version || '1.0.0'
        this.description = data.description || ''
        this.endpoints = data.endpoints || []
        this.authentication = data.authentication || {}
        this.schemas = data.schemas || {}
        this.isActive = data.isActive !== undefined ? data.isActive : true
        this.createdAt = data.createdAt || new Date()
        this.updatedAt = data.updatedAt || new Date()
        this.lastUsedAt = data.lastUsedAt || null
    }

    /**
     * Check if module is active
     * @returns {boolean}
     */
    isActive() {
        return this.isActive
    }

    /**
     * Add endpoint to module
     * @param {Object} endpoint
     */
    addEndpoint(endpoint) {
        if (!endpoint.path || !endpoint.method) {
            throw new Error('Endpoint must have path and method')
        }
        this.endpoints.push(endpoint)
        this.updatedAt = new Date()
    }

    /**
     * Remove endpoint from module
     * @param {string} path
     * @param {string} method
     */
    removeEndpoint(path, method) {
        this.endpoints = this.endpoints.filter(
            ep => !(ep.path === path && ep.method === method)
        )
        this.updatedAt = new Date()
    }

    /**
     * Get endpoint by path and method
     * @param {string} path
     * @param {string} method
     * @returns {Object|undefined}
     */
    getEndpoint(path, method) {
        return this.endpoints.find(
            ep => ep.path === path && ep.method === method
        )
    }

    /**
     * Update authentication configuration
     * @param {Object} auth
     */
    updateAuthentication(auth) {
        this.authentication = { ...this.authentication, ...auth }
        this.updatedAt = new Date()
    }

    /**
     * Add schema
     * @param {string} name
     * @param {Object} schema
     */
    addSchema(name, schema) {
        this.schemas[name] = schema
        this.updatedAt = new Date()
    }

    /**
     * Get schema by name
     * @param {string} name
     * @returns {Object|undefined}
     */
    getSchema(name) {
        return this.schemas[name]
    }

    /**
     * Activate module
     */
    activate() {
        this.isActive = true
        this.updatedAt = new Date()
    }

    /**
     * Deactivate module
     */
    deactivate() {
        this.isActive = false
        this.updatedAt = new Date()
    }

    /**
     * Record usage
     */
    recordUsage() {
        this.lastUsedAt = new Date()
        this.updatedAt = new Date()
    }

    /**
     * Validate module data
     * @returns {boolean}
     */
    isValid() {
        return !!(this.id && this.name && this.version)
    }

    /**
     * Get module display name
     * @returns {string}
     */
    getDisplayName() {
        return `${this.name} v${this.version}`
    }

    /**
     * Convert to plain object
     * @returns {Object}
     */
    toJSON() {
        return {
            id: this.id,
            name: this.name,
            version: this.version,
            description: this.description,
            endpoints: this.endpoints,
            authentication: this.authentication,
            schemas: this.schemas,
            isActive: this.isActive,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            lastUsedAt: this.lastUsedAt
        }
    }
}
