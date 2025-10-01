/**
 * @file Domain Integration Option Model
 * @description Available integration types that can be installed
 */

export class IntegrationOption {
    constructor({
        type,
        displayName,
        description = '',
        logo = '',
        category = '',
        detailsUrl = '',
        version = '1.0.0',
        modules = {},
        requiredEntities = [],
        entities = {}
    }) {
        this.type = type;
        this.displayName = displayName;
        this.description = description;
        this.logo = logo;
        this.category = category;
        this.detailsUrl = detailsUrl;
        this.version = version;
        this.modules = modules;
        this.requiredEntities = requiredEntities;
        this.entities = entities;
    }

    /**
     * Get required entity types (only non-global entities)
     */
    getRequiredUserEntityTypes() {
        if (!this.entities || Object.keys(this.entities).length === 0) {
            return this.requiredEntities;
        }

        return Object.entries(this.entities)
            .filter(([key, config]) => !config.global && config.required !== false)
            .map(([key, config]) => config.type);
    }

    /**
     * Get optional entity types (only non-global entities)
     */
    getOptionalUserEntityTypes() {
        if (!this.entities) return [];

        return Object.entries(this.entities)
            .filter(([key, config]) => !config.global && config.required === false)
            .map(([key, config]) => config.type);
    }

    /**
     * Check if a specific module is required
     */
    isModuleRequired(moduleKey) {
        return this.requiredEntities.includes(moduleKey);
    }

    /**
     * Get module count
     */
    getModuleCount() {
        return Object.keys(this.modules).length;
    }

    /**
     * Get module types as array
     */
    getModuleTypes() {
        return Object.keys(this.modules);
    }

    /**
     * Check if integration has a specific category
     */
    hasCategory(category) {
        return this.category === category;
    }

    /**
     * Serialize to plain object
     */
    toJSON() {
        return {
            type: this.type,
            displayName: this.displayName,
            description: this.description,
            logo: this.logo,
            category: this.category,
            detailsUrl: this.detailsUrl,
            version: this.version,
            modules: this.modules,
            requiredEntities: this.requiredEntities,
            entities: this.entities
        };
    }

    /**
     * Create from API response
     */
    static fromApiResponse(data) {
        return new IntegrationOption(data);
    }
}
