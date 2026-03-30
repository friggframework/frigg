const {IntegrationId} = require('../value-objects/IntegrationId');
const {IntegrationName} = require('../value-objects/IntegrationName');
const {SemanticVersion} = require('../value-objects/SemanticVersion');
const {DomainException} = require('../exceptions/DomainException');

/**
 * Integration Aggregate Root
 * Represents a Frigg integration with business rules
 */
class Integration {
    constructor(props) {
        // Value objects (immutable, self-validating)
        this.id = props.id instanceof IntegrationId ? props.id : new IntegrationId(props.id);
        this.name = props.name instanceof IntegrationName ? props.name : new IntegrationName(props.name);
        this.version = props.version instanceof SemanticVersion
            ? props.version
            : new SemanticVersion(props.version || '1.0.0');

        // Simple properties
        this.displayName = props.displayName || this._generateDisplayName();
        this.description = props.description || '';
        this.type = props.type || 'custom';
        this.category = props.category;
        this.tags = props.tags || [];

        // Complex properties
        this.entities = props.entities || {};
        this.apiModules = props.apiModules || [];
        this.capabilities = props.capabilities || {};
        this.requirements = props.requirements || {};
        this.options = props.options || {};

        // Metadata
        this.createdAt = props.createdAt || new Date();
        this.updatedAt = props.updatedAt || new Date();
    }

    /**
     * Factory method for creating new integrations
     */
    static create(props) {
        return new Integration({
            id: IntegrationId.generate(),
            ...props,
            createdAt: new Date(),
            updatedAt: new Date()
        });
    }

    /**
     * Add an API module to this integration
     */
    addApiModule(moduleName, moduleVersion, source = 'npm') {
        if (this.hasApiModule(moduleName)) {
            throw new DomainException(`API module '${moduleName}' is already added to this integration`);
        }

        this.apiModules.push({
            name: moduleName,
            version: moduleVersion,
            source
        });

        this.updatedAt = new Date();
        return this;
    }

    /**
     * Remove an API module from this integration
     */
    removeApiModule(moduleName) {
        const index = this.apiModules.findIndex(m => m.name === moduleName);
        if (index === -1) {
            throw new DomainException(`API module '${moduleName}' not found in this integration`);
        }

        this.apiModules.splice(index, 1);
        this.updatedAt = new Date();
        return this;
    }

    /**
     * Check if API module is already added
     */
    hasApiModule(moduleName) {
        return this.apiModules.some(m => m.name === moduleName);
    }

    /**
     * Add an entity to this integration
     */
    addEntity(entityKey, entityConfig) {
        if (this.entities[entityKey]) {
            throw new DomainException(`Entity '${entityKey}' already exists in this integration`);
        }

        this.entities[entityKey] = {
            type: entityConfig.type || entityKey,
            label: entityConfig.label,
            global: entityConfig.global || false,
            autoProvision: entityConfig.autoProvision || false,
            required: entityConfig.required !== false
        };

        this.updatedAt = new Date();
        return this;
    }

    /**
     * Validate integration business rules
     */
    validate() {
        const errors = [];

        // Display name validation
        if (!this.displayName || this.displayName.trim().length === 0) {
            errors.push('Display name is required');
        }

        // Description validation
        if (this.description && this.description.length > 1000) {
            errors.push('Description must be 1000 characters or less');
        }

        // Type validation
        const validTypes = ['api', 'webhook', 'sync', 'transform', 'custom'];
        if (!validTypes.includes(this.type)) {
            errors.push(`Invalid integration type: ${this.type}. Must be one of: ${validTypes.join(', ')}`);
        }

        // Entity validation
        if (Object.keys(this.entities).length === 0) {
            // Warning: integration with no entities is unusual but not invalid
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Convert to plain object (for persistence)
     */
    toObject() {
        return {
            id: this.id.value,
            name: this.name.value,
            version: this.version.value,
            displayName: this.displayName,
            description: this.description,
            type: this.type,
            category: this.category,
            tags: this.tags,
            entities: this.entities,
            apiModules: this.apiModules,
            capabilities: this.capabilities,
            requirements: this.requirements,
            options: this.options,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }

    /**
     * Convert to JSON format (for integration-definition.json)
     * Follows the integration-definition.schema.json structure
     */
    toJSON() {
        return {
            name: this.name.value,
            version: this.version.value,
            options: {
                type: this.type,
                display: {
                    name: this.displayName,
                    description: this.description || '',
                    category: this.category,
                    tags: this.tags
                },
                ...this.options
            },
            entities: this.entities,
            capabilities: this.capabilities,
            requirements: this.requirements
        };
    }

    _generateDisplayName() {
        // Convert kebab-case to Title Case
        return this.name.value
            .split('-')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');
    }
}

module.exports = {Integration};
