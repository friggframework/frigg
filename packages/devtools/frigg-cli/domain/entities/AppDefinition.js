const {DomainException} = require('../exceptions/DomainException');
const {SemanticVersion} = require('../value-objects/SemanticVersion');

/**
 * AppDefinition Aggregate Root
 *
 * Represents the entire Frigg application configuration
 * Contains metadata about the app and references to all integrations
 */
class AppDefinition {
    constructor(props) {
        this.name = props.name;
        this.version = props.version instanceof SemanticVersion ?
            props.version : new SemanticVersion(props.version);
        this.description = props.description || '';
        this.author = props.author || '';
        this.license = props.license || 'UNLICENSED';
        this.repository = props.repository || {};
        this.integrations = props.integrations || [];
        this.apiModules = props.apiModules || [];
        this.config = props.config || {};
        this.createdAt = props.createdAt || new Date();
        this.updatedAt = props.updatedAt || new Date();
    }

    /**
     * Factory method to create a new AppDefinition
     */
    static create(props) {
        return new AppDefinition(props);
    }

    /**
     * Register an integration in the app
     * @param {string} integrationName - Name of the integration to register
     */
    registerIntegration(integrationName) {
        if (this.hasIntegration(integrationName)) {
            throw new DomainException(`Integration '${integrationName}' is already registered`);
        }

        this.integrations.push({
            name: integrationName,
            enabled: true,
            registeredAt: new Date()
        });

        this.updatedAt = new Date();
        return this;
    }

    /**
     * Unregister an integration from the app
     * @param {string} integrationName
     */
    unregisterIntegration(integrationName) {
        const index = this.integrations.findIndex(i => i.name === integrationName);

        if (index === -1) {
            throw new DomainException(`Integration '${integrationName}' is not registered`);
        }

        this.integrations.splice(index, 1);
        this.updatedAt = new Date();
        return this;
    }

    /**
     * Check if an integration is registered
     * @param {string} integrationName
     * @returns {boolean}
     */
    hasIntegration(integrationName) {
        return this.integrations.some(i => i.name === integrationName);
    }

    /**
     * Enable an integration
     * @param {string} integrationName
     */
    enableIntegration(integrationName) {
        const integration = this.integrations.find(i => i.name === integrationName);

        if (!integration) {
            throw new DomainException(`Integration '${integrationName}' is not registered`);
        }

        integration.enabled = true;
        this.updatedAt = new Date();
        return this;
    }

    /**
     * Disable an integration
     * @param {string} integrationName
     */
    disableIntegration(integrationName) {
        const integration = this.integrations.find(i => i.name === integrationName);

        if (!integration) {
            throw new DomainException(`Integration '${integrationName}' is not registered`);
        }

        integration.enabled = false;
        this.updatedAt = new Date();
        return this;
    }

    /**
     * Register an API module
     * @param {string} moduleName
     * @param {string} moduleVersion
     * @param {string} source - npm, local, git
     */
    registerApiModule(moduleName, moduleVersion, source = 'npm') {
        if (this.hasApiModule(moduleName)) {
            throw new DomainException(`API module '${moduleName}' is already registered`);
        }

        this.apiModules.push({
            name: moduleName,
            version: moduleVersion,
            source,
            registeredAt: new Date()
        });

        this.updatedAt = new Date();
        return this;
    }

    /**
     * Check if an API module is registered
     * @param {string} moduleName
     * @returns {boolean}
     */
    hasApiModule(moduleName) {
        return this.apiModules.some(m => m.name === moduleName);
    }

    /**
     * Get all enabled integrations
     * @returns {Array}
     */
    getEnabledIntegrations() {
        return this.integrations.filter(i => i.enabled);
    }

    /**
     * Validate app definition business rules
     */
    validate() {
        const errors = [];

        // Name validation
        if (!this.name || this.name.trim().length === 0) {
            errors.push('App name is required');
        }

        if (this.name && this.name.length > 100) {
            errors.push('App name must be 100 characters or less');
        }

        // Version validation (handled by SemanticVersion value object)

        // Description validation
        if (this.description && this.description.length > 1000) {
            errors.push('Description must be 1000 characters or less');
        }

        // Integrations validation
        const integrationNames = this.integrations.map(i => i.name);
        const uniqueNames = new Set(integrationNames);
        if (integrationNames.length !== uniqueNames.size) {
            errors.push('Duplicate integration names found');
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
            description: this.description,
            author: this.author,
            license: this.license,
            repository: this.repository,
            integrations: this.integrations,
            apiModules: this.apiModules,
            config: this.config,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }

    /**
     * Convert to JSON format (for app-definition.json)
     */
    toJSON() {
        return {
            name: this.name,
            version: this.version.value,
            description: this.description,
            author: this.author,
            license: this.license,
            repository: this.repository,
            integrations: this.integrations.map(i => ({
                name: i.name,
                enabled: i.enabled
            })),
            apiModules: this.apiModules.map(m => ({
                name: m.name,
                version: m.version,
                source: m.source
            })),
            config: this.config
        };
    }
}

module.exports = {AppDefinition};
