const {DomainException} = require('../exceptions/DomainException');
const {SemanticVersion} = require('../value-objects/SemanticVersion');

/**
 * ApiModule Entity
 *
 * Represents an API module that can be used by integrations
 * API modules are reusable API clients for external services
 */
class ApiModule {
    constructor(props) {
        this.name = props.name; // kebab-case name
        this.version = props.version instanceof SemanticVersion ?
            props.version : new SemanticVersion(props.version || '1.0.0');
        this.displayName = props.displayName || this._generateDisplayName();
        this.description = props.description || '';
        this.author = props.author || '';
        this.license = props.license || 'UNLICENSED';
        this.apiConfig = props.apiConfig || {
            baseUrl: '',
            authType: 'oauth2',
            version: 'v1'
        };
        this.entities = props.entities || {}; // Database entities this module needs
        this.scopes = props.scopes || []; // OAuth scopes required
        this.credentials = props.credentials || []; // Required credentials
        this.endpoints = props.endpoints || {}; // API endpoints
        this.createdAt = props.createdAt || new Date();
        this.updatedAt = props.updatedAt || new Date();
    }

    /**
     * Factory method to create a new ApiModule
     */
    static create(props) {
        if (!props.name) {
            throw new DomainException('API module name is required');
        }

        // Validate name format
        const namePattern = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
        if (!namePattern.test(props.name)) {
            throw new DomainException('API module name must be kebab-case');
        }

        // Validate authType is provided
        if (!props.apiConfig || !props.apiConfig.authType) {
            throw new DomainException('Authentication type is required');
        }

        return new ApiModule(props);
    }

    /**
     * Reconstruct ApiModule from plain object
     */
    static fromObject(obj) {
        return new ApiModule({
            ...obj,
            version: obj.version,
            createdAt: new Date(obj.createdAt),
            updatedAt: new Date(obj.updatedAt)
        });
    }

    /**
     * Add an entity configuration
     * Entities are database records that store API credentials and state
     *
     * @param {string} entityName - Entity name (e.g., 'credential', 'user')
     * @param {object} config - Entity configuration
     */
    addEntity(entityName, config = {}) {
        if (this.hasEntity(entityName)) {
            throw new DomainException(`Entity '${entityName}' already exists`);
        }

        this.entities[entityName] = {
            type: entityName,
            label: config.label || entityName,
            required: config.required !== false,
            fields: config.fields || [],
            ...config
        };

        this.updatedAt = new Date();
        return this;
    }

    /**
     * Check if entity exists
     */
    hasEntity(entityName) {
        return entityName in this.entities;
    }

    /**
     * Add an endpoint definition
     */
    addEndpoint(name, config) {
        if (this.hasEndpoint(name)) {
            throw new DomainException(`Endpoint '${name}' already exists`);
        }

        this.endpoints[name] = {
            method: config.method || 'GET',
            path: config.path,
            description: config.description || '',
            parameters: config.parameters || [],
            response: config.response || {},
            ...config
        };

        this.updatedAt = new Date();
        return this;
    }

    /**
     * Check if endpoint exists
     */
    hasEndpoint(name) {
        return name in this.endpoints;
    }

    /**
     * Add required OAuth scope
     */
    addScope(scope) {
        if (this.scopes.includes(scope)) {
            throw new DomainException(`Scope '${scope}' already exists`);
        }
        this.scopes.push(scope);
        this.updatedAt = new Date();
        return this;
    }

    /**
     * Add required credential
     */
    addCredential(name, config = {}) {
        const existing = this.credentials.find(c => c.name === name);
        if (existing) {
            throw new DomainException(`Credential '${name}' already exists`);
        }

        this.credentials.push({
            name,
            type: config.type || 'string',
            required: config.required !== false,
            description: config.description || '',
            example: config.example || '',
            envVar: config.envVar || '',
            ...config
        });

        this.updatedAt = new Date();
        return this;
    }

    /**
     * Check if credential exists
     */
    hasCredential(name) {
        return this.credentials.some(c => c.name === name);
    }

    /**
     * Validate API module business rules
     */
    validate() {
        const errors = [];

        // Name validation (kebab-case)
        if (!this.name || this.name.trim().length === 0) {
            errors.push('API module name is required');
        }

        const namePattern = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;
        if (this.name && !namePattern.test(this.name)) {
            errors.push('API module name must be kebab-case');
        }

        // Display name validation
        if (!this.displayName || this.displayName.trim().length === 0) {
            errors.push('Display name is required');
        }

        // Description validation
        if (this.description && this.description.length > 1000) {
            errors.push('Description must be 1000 characters or less');
        }

        // API config validation
        if (!this.apiConfig.baseUrl) {
            // Warning: base URL should be provided, but not required at creation
        }

        // Auth type validation
        if (!this.apiConfig.authType || this.apiConfig.authType.trim().length === 0) {
            errors.push('Authentication type is required');
        } else {
            const validAuthTypes = ['oauth2', 'api-key', 'basic', 'token', 'custom'];
            if (!validAuthTypes.includes(this.apiConfig.authType)) {
                errors.push(`Invalid auth type. Must be one of: ${validAuthTypes.join(', ')}`);
            }
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Convert to plain object
     */
    toObject() {
        return {
            name: this.name,
            version: this.version.value,
            displayName: this.displayName,
            description: this.description,
            author: this.author,
            license: this.license,
            apiConfig: this.apiConfig,
            entities: this.entities,
            scopes: this.scopes,
            credentials: this.credentials,
            endpoints: this.endpoints,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }

    /**
     * Convert to JSON format (for api-module definition files)
     */
    toJSON() {
        return {
            name: this.name,
            version: this.version.value,
            display: {
                name: this.displayName,
                description: this.description
            },
            api: {
                baseUrl: this.apiConfig.baseUrl,
                authType: this.apiConfig.authType,
                version: this.apiConfig.version
            },
            entities: this.entities,
            auth: {
                type: this.apiConfig.authType,
                scopes: this.scopes,
                credentials: this.credentials
            },
            endpoints: this.endpoints
        };
    }

    /**
     * Generate display name from kebab-case name
     */
    _generateDisplayName() {
        return this.name
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }
}

module.exports = {ApiModule};
