const { IntegrationMapping } = require('./integration-mapping');
const { Options } = require('./options');
const { UpdateIntegrationStatus } = require('./use-cases/update-integration-status');
const { IntegrationRepository } = require('./integration-repository');
const { UpdateIntegrationMessages } = require('./use-cases/update-integration-messages');

const constantsToBeMigrated = {
    defaultEvents: {
        ON_CREATE: 'ON_CREATE',
        ON_UPDATE: 'ON_UPDATE',
        ON_DELETE: 'ON_DELETE',
        GET_CONFIG_OPTIONS: 'GET_CONFIG_OPTIONS',
        REFRESH_CONFIG_OPTIONS: 'REFRESH_CONFIG_OPTIONS',
        GET_USER_ACTIONS: 'GET_USER_ACTIONS',
        GET_USER_ACTION_OPTIONS: 'GET_USER_ACTION_OPTIONS',
        REFRESH_USER_ACTION_OPTIONS: 'REFRESH_USER_ACTION_OPTIONS',
        // etc...
    },
    types: {
        LIFE_CYCLE_EVENT: 'LIFE_CYCLE_EVENT',
        USER_ACTION: 'USER_ACTION',
    },
};

class IntegrationBase {

    // todo: maybe we can pass this as Dependency Injection in the sub-class constructor
    integrationRepository = new IntegrationRepository();
    updateIntegrationStatus = new UpdateIntegrationStatus({ integrationRepository: this.integrationRepository });
    updateIntegrationMessages = new UpdateIntegrationMessages({ integrationRepository: this.integrationRepository });

    static getOptionDetails() {
        const options = new Options({
            module: Object.values(this.Definition.modules)[0], // This is a placeholder until we revamp the frontend
            ...this.Definition,
        });
        return options.get();
    }

    /**
     * CHILDREN SHOULD SPECIFY A DEFINITION FOR THE INTEGRATION
     */
    static Definition = {
        name: 'Integration Name',
        version: '0.0.0', // Integration Version, used for migration and storage purposes, as well as display
        supportedVersions: [], // Eventually usable for deprecation and future test version purposes

        modules: {},
        display: {
            name: 'Integration Name',
            logo: '',
            description: '',
            // etc...
        },
    };

    static getName() {
        return this.Definition.name;
    }

    static getCurrentVersion() {
        return this.Definition.version;
    }

    registerEventHandlers() {
        this.on = {
            ...this.defaultEvents,
            ...this.events,
        };
    }

    constructor(params = {}) {
        // Data from database record (when instantiated by use cases)
        this.id = params.id;
        this.userId = params.userId || params.integrationId; // fallback for legacy
        this.entities = params.entities;
        this.config = params.config;
        this.status = params.status;
        this.version = params.version;
        this.messages = params.messages || { errors: [], warnings: [] };
        
        // Module instances (injected by factory)
        this.modules = {};
        if (params.modules) {
            for (const mod of params.modules) {
                const key = typeof mod.getName === 'function' ? mod.getName() : mod.name;
                if (key) {
                    this.modules[key] = mod;
                    this[key] = mod; // Direct access (e.g., this.hubspot)
                }
            }
        }

        // Initialize events object (will be populated by child classes)
        this.events = this.events || {};

        this.defaultEvents = {
            [constantsToBeMigrated.defaultEvents.ON_CREATE]: {
                type: constantsToBeMigrated.types.LIFE_CYCLE_EVENT,
                handler: this.onCreate,
            },
            [constantsToBeMigrated.defaultEvents.ON_UPDATE]: {
                type: constantsToBeMigrated.types.LIFE_CYCLE_EVENT,
                handler: this.onUpdate,
            },
            [constantsToBeMigrated.defaultEvents.ON_DELETE]: {
                type: constantsToBeMigrated.types.LIFE_CYCLE_EVENT,
                handler: this.onDelete,
            },
            [constantsToBeMigrated.defaultEvents.GET_CONFIG_OPTIONS]: {
                type: constantsToBeMigrated.types.LIFE_CYCLE_EVENT,
                handler: this.getConfigOptions,
            },
            [constantsToBeMigrated.defaultEvents.REFRESH_CONFIG_OPTIONS]: {
                type: constantsToBeMigrated.types.LIFE_CYCLE_EVENT,
                handler: this.refreshConfigOptions,
            },
            [constantsToBeMigrated.defaultEvents.GET_USER_ACTIONS]: {
                type: constantsToBeMigrated.types.LIFE_CYCLE_EVENT,
                handler: this.loadUserActions,
            },
            [constantsToBeMigrated.defaultEvents.GET_USER_ACTION_OPTIONS]: {
                type: constantsToBeMigrated.types.LIFE_CYCLE_EVENT,
                handler: this.getActionOptions,
            },
            [constantsToBeMigrated.defaultEvents.REFRESH_USER_ACTION_OPTIONS]: {
                type: constantsToBeMigrated.types.LIFE_CYCLE_EVENT,
                handler: this.refreshActionOptions,
            },
        };
    }

    async send(event, object) {
        if (!this.on[event]) {
            throw new Error(
                `Event ${event} is not defined in the Integration event object`
            );
        }
        return this.on[event].handler.call(this, object);
    }

    async validateConfig() {
        const configOptions = await this.getConfigOptions();
        const currentConfig = this.getConfig();
        let needsConfig = false;
        for (const option of configOptions) {
            if (option.required) {
                // For now, just make sure the key exists. We should add more dynamic/better validation later.
                if (
                    !Object.prototype.hasOwnProperty.call(
                        currentConfig,
                        option.key
                    )
                ) {
                    needsConfig = true;
                    await this.updateIntegrationMessages.execute(
                        this.id,
                        'warnings',
                        'Config Validation Error',
                        `Missing required field of ${option.label}`,
                        Date.now()
                    );
                }
            }
        }
        if (needsConfig) {
            await this.updateIntegrationStatus.execute(this.id, 'NEEDS_CONFIG');
        }
    }

    async testAuth() {
        let didAuthPass = true;

        for (const module of Object.keys(this.constructor.Definition.modules)) {
            try {
                await this[module].testAuth();
            } catch {
                didAuthPass = false;
                await this.updateIntegrationMessages.execute(
                    this.id,
                    'errors',
                    'Authentication Error',
                    `There was an error with your ${this[
                        module
                    ].constructor.getName()} Entity.
                Please reconnect/re-authenticate, or reach out to Support for assistance.`,
                    Date.now()
                );
            }
        }

        if (!didAuthPass) {
            await this.updateIntegrationStatus.execute(this.id, 'ERROR');
        }
    }

    async getMapping(sourceId) {
        // todo: this should be a use case
        return IntegrationMapping.findBy(this.id, sourceId);
    }

    async upsertMapping(sourceId, mapping) {
        if (!sourceId) {
            throw new Error(`sourceId must be set`);
        }
        // todo: this should be a use case
        return await IntegrationMapping.upsert(
            this.id,
            sourceId,
            mapping
        );
    }

    /**
     * CHILDREN CAN OVERRIDE THESE CONFIGURATION METHODS
     */
    async onCreate({ integrationId }) {
        await this.updateIntegrationStatus.execute(integrationId, 'ENABLED');
    }

    async onUpdate(params) { }

    async onDelete(params) { }

    async getConfigOptions() {
        const options = {
            jsonSchema: {},
            uiSchema: {},
        };
        return options;
    }

    async refreshConfigOptions(params) {
        const options = {
            jsonSchema: {},
            uiSchema: {},
        };
        return options;
    }

    async loadDynamicUserActions() {
        // Child class should override this method to load dynamic user actions.
        // Dynamic user actions should return in the same form a valid event object

        return {};
    }
    async loadUserActions({ actionType } = {}) {
        console.log('loadUserActions called with actionType:', actionType);
        const userActions = {};
        for (const [key, event] of Object.entries(this.events)) {
            if (event.type === constantsToBeMigrated.types.USER_ACTION) {
                if (!actionType || event.userActionType === actionType) {
                    userActions[key] = event;
                }
            }
        }
        const dynamicUserActions = await this.loadDynamicUserActions();
        const filteredDynamicActions = actionType
            ? Object.fromEntries(
                Object.entries(dynamicUserActions).filter(
                    ([_, event]) => event.userActionType === actionType
                )
            )
            : dynamicUserActions;
        return { ...userActions, ...filteredDynamicActions };
    }

    async getActionOptions(actionId, data) {
        const options = {
            jsonSchema: {},
            uiSchema: {},
        };
        return options;
    }

    async refreshActionOptions(params) {
        const options = {
            jsonSchema: {},
            uiSchema: {},
        };
        return options;
    }

    // === Domain Methods (moved from Integration.js) ===
    
    getConfig() {
        return this.config;
    }

    getModule(key) {
        return this.modules[key];
    }

    setModule(key, module) {
        this.modules[key] = module;
        this[key] = module;
    }

    addError(error) {
        if (!this.messages.errors) {
            this.messages.errors = [];
        }
        this.messages.errors.push(error);
        this.status = 'ERROR';
    }

    addWarning(warning) {
        if (!this.messages.warnings) {
            this.messages.warnings = [];
        }
        this.messages.warnings.push(warning);
    }

    isActive() {
        return this.status === 'ENABLED' || this.status === 'ACTIVE';
    }

    needsConfiguration() {
        return this.status === 'NEEDS_CONFIG';
    }

    hasErrors() {
        return this.status === 'ERROR';
    }

    belongsToUser(userId) {
        return this.userId.toString() === userId.toString();
    }

    async initialize() {
        // Load dynamic user actions
        try {
            const additionalUserActions = await this.loadDynamicUserActions();
            this.events = { ...this.events, ...additionalUserActions };
        } catch (e) {
            this.addError(e);
        }

        // Register event handlers
        await this.registerEventHandlers();
    }

    getOptionDetails() {
        const options = new Options({
            module: Object.values(this.constructor.Definition.modules)[0],
            ...this.constructor.Definition,
        });
        return options.get();
    }

    // Legacy method for backward compatibility
    async loadModules() {
        // This method was used in the old architecture for loading modules
        // In the new architecture, modules are injected via constructor
        // For backward compatibility, this is a no-op
        return;
    }
}

module.exports = { IntegrationBase };
