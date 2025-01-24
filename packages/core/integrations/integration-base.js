const { IntegrationMapping } = require('./integration-mapping');
const { Options } = require('./options');
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
    loadModules() {
        // Load all the modules defined in Definition.modules
        const moduleNames = Object.keys(this.constructor.Definition.modules);
        for (const moduleName of moduleNames) {
            const { definition } =
                this.constructor.Definition.modules[moduleName];
            if (typeof definition.API === 'function') {
                this[moduleName] = { api: new definition.API() };
            } else {
                throw new Error(
                    `Module ${moduleName} must be a function that extends IntegrationModule`
                );
            }
        }
    }
    registerEventHandlers() {
        this.on = {
            ...this.defaultEvents,
            ...this.events,
        };
    }

    constructor(params) {
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
        this.loadModules();
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
        const currentConfig = this.record.config;
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
                    this.record.messages.warnings.push({
                        title: 'Config Validation Error',
                        message: `Missing required field of ${option.label}`,
                        timestamp: Date.now(),
                    });
                }
            }
        }
        if (needsConfig) {
            this.record.status = 'NEEDS_CONFIG';
            await this.record.save();
        }
    }

    async testAuth() {
        let didAuthPass = true;

        for (const module of Object.keys(IntegrationBase.Definition.modules)) {
            try {
                await this[module].testAuth();
            } catch {
                didAuthPass = false;
                this.record.messages.errors.push({
                    title: 'Authentication Error',
                    message: `There was an error with your ${this[
                        module
                    ].constructor.getName()} Entity.
                Please reconnect/re-authenticate, or reach out to Support for assistance.`,
                    timestamp: Date.now(),
                });
            }
        }

        if (!didAuthPass) {
            this.record.status = 'ERROR';
            this.record.markModified('messages.error');
            await this.record.save();
        }
    }

    async getMapping(sourceId) {
        return IntegrationMapping.findBy(this.record.id, sourceId);
    }

    async upsertMapping(sourceId, mapping) {
        if (!sourceId) {
            throw new Error(`sourceId must be set`);
        }
        return await IntegrationMapping.upsert(
            this.record.id,
            sourceId,
            mapping
        );
    }

    /**
     * CHILDREN CAN OVERRIDE THESE CONFIGURATION METHODS
     */
    async onCreate(params) {
        this.record.status = 'ENABLED';
        await this.record.save();
        return this.record;
    }

    async onUpdate(params) {}

    async onDelete(params) {}

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
}

module.exports = { IntegrationBase };
