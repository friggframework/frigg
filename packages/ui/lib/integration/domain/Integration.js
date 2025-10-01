/**
 * @file Domain Integration Model
 * @description Core integration domain model
 * Represents an installed integration with its entities and configuration
 */

export class Integration {
    constructor({
        id,
        type,
        displayName,
        description = '',
        status = 'active',
        config = {},
        entities = [],
        modules = {},
        userActions = [],
        version = '0.0.0',
        messages = { errors: [], warnings: [], info: [] },
        createdAt,
        updatedAt
    }) {
        this.id = id;
        this.type = type;
        this.displayName = displayName;
        this.description = description;
        this.status = status;
        this.config = config;
        this.entities = entities;
        this.modules = modules;
        this.userActions = userActions;
        this.version = version;
        this.messages = messages;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    /**
     * Check if integration is active
     */
    isActive() {
        return this.status === 'active';
    }

    /**
     * Check if integration has errors
     */
    hasErrors() {
        return !!(this.messages.errors && this.messages.errors.length > 0);
    }

    /**
     * Get entity by type
     */
    getEntityByType(type) {
        return this.entities.find(entity => entity.type === type);
    }

    /**
     * Get all entity IDs
     */
    getEntityIds() {
        return this.entities.map(entity => entity.id);
    }

    /**
     * Check if integration has a specific module
     */
    hasModule(moduleKey) {
        return this.modules && this.modules[moduleKey] !== undefined;
    }

    /**
     * Get module by key
     */
    getModule(moduleKey) {
        return this.modules?.[moduleKey] ?? null;
    }

    /**
     * Get all module types
     */
    getModuleTypes() {
        return this.modules ? Object.keys(this.modules) : [];
    }

    /**
     * Serialize to plain object
     */
    toJSON() {
        return {
            id: this.id,
            type: this.type,
            displayName: this.displayName,
            description: this.description,
            status: this.status,
            config: this.config,
            entities: this.entities,
            modules: this.modules,
            userActions: this.userActions,
            version: this.version,
            messages: this.messages,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }

    /**
     * Create from API response
     */
    static fromApiResponse(data) {
        return new Integration(data);
    }
}
