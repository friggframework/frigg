const {
    createIntegrationMappingRepository,
} = require('./repositories/integration-mapping-repository-factory');
const { Options } = require('./options');
const {
    UpdateIntegrationStatus,
} = require('./use-cases/update-integration-status');
const {
    createIntegrationRepository,
} = require('./repositories/integration-repository-factory');
const {
    UpdateIntegrationMessages,
} = require('./use-cases/update-integration-messages');

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
        WEBHOOK_RECEIVED: 'WEBHOOK_RECEIVED', // HTTP handler, no DB
        ON_WEBHOOK: 'ON_WEBHOOK', // Queue worker, DB-connected
        // etc...
    },
    types: {
        LIFE_CYCLE_EVENT: 'LIFE_CYCLE_EVENT',
        USER_ACTION: 'USER_ACTION',
    },
};

class IntegrationBase {
    // todo: maybe we can pass this as Dependency Injection in the sub-class constructor
    integrationRepository = createIntegrationRepository();
    integrationMappingRepository = createIntegrationMappingRepository();
    updateIntegrationStatus = new UpdateIntegrationStatus({
        integrationRepository: this.integrationRepository,
    });
    updateIntegrationMessages = new UpdateIntegrationMessages({
        integrationRepository: this.integrationRepository,
    });

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

    // REMOVED: registerEventHandlers() - Event handling is now done by IntegrationEventDispatcher

    constructor(params = {}) {
        this.modules = {};
        this.events = this.events || {};
        this.messages = { errors: [], warnings: [] };
        this._isHydrated = false;

        if (params && Object.keys(params).length > 0) {
            this.setIntegrationRecord({
                record: {
                    id: params.id,
                    userId: params.userId,
                    entities: params.entities,
                    config: params.config,
                    status: params.status,
                    version: params.version,
                    messages: params.messages,
                },
                modules: params.modules || [],
            });
        }

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
            [constantsToBeMigrated.defaultEvents.WEBHOOK_RECEIVED]: {
                type: constantsToBeMigrated.types.LIFE_CYCLE_EVENT,
                handler: this.onWebhookReceived,
            },
            [constantsToBeMigrated.defaultEvents.ON_WEBHOOK]: {
                type: constantsToBeMigrated.types.LIFE_CYCLE_EVENT,
                handler: this.onWebhook,
            },
        };
    }

    // todo: debate wether we want to keep this pattern to set the record or not.
    /**
     * Persist the database record and module instances onto this integration instance.
     * Accepts either a plain object containing the persisted fields or an object with
     * a `record` property plus a `modules` collection.
     * @param {Object} payload
     * @param {Object} [payload.record]
     * @param {Array} [payload.modules]
     */
    setIntegrationRecord(payload = {}) {
        if (!payload || Object.keys(payload).length === 0) {
            throw new Error('setIntegrationRecord requires integration data');
        }

        const integrationRecord = payload.record;
        const integrationModules = payload.modules ?? [];

        if (!integrationRecord) {
            throw new Error('Integration record not provided');
        }

        const { id, userId, entities, config, status, version, messages } =
            integrationRecord;

        this.id = id;
        this.userId = userId;
        this.entities = entities;
        this.config = config;
        this.status = status;
        this.version = version;
        this.messages = messages || { errors: [], warnings: [] };

        this.modules = this._appendModules(integrationModules);

        this.record = {
            id: this.id,
            userId: this.userId,
            entities: this.entities,
            config: this.config,
            status: this.status,
            version: this.version,
            messages: this.messages,
        };

        this._isHydrated = Boolean(this.id);
        return this;
    }

    get isHydrated() {
        return this._isHydrated;
    }

    assertHydrated(message = 'Integration instance is not hydrated') {
        if (!this.isHydrated) {
            throw new Error(message);
        }
    }

    /**
     * Returns the modules as object with keys as module names.
     * Uses the keys from Definition.modules to attach modules correctly.
     * 
     * Example:
     *   Definition.modules = { attio: {...}, quo: { definition: { getName: () => 'quo-attio' } } }
     *   Module with getName()='quo-attio' gets attached as this.quo (not this['quo-attio'])
     * 
     * @private
     * @param {Array} integrationModules - Array of module instances
     * @returns {Object} The modules object
     */
    _appendModules(integrationModules) {
        const modules = {};

        // Build reverse mapping: definition.getName() → referenceKey
        // e.g., 'quo-attio' → 'quo', 'attio' → 'attio'
        const moduleNameToKey = {};
        if (this.constructor.Definition?.modules) {
            for (const [key, moduleConfig] of Object.entries(this.constructor.Definition.modules)) {
                const definition = moduleConfig.definition;
                if (definition) {
                    // Use getName() if available, fallback to moduleName
                    const definitionName = typeof definition.getName === 'function'
                        ? definition.getName()
                        : definition.moduleName;
                    if (definitionName) {
                        moduleNameToKey[definitionName] = key;
                    }
                }
            }
        }

        for (const module of integrationModules) {
            const moduleName =
                typeof module.getName === 'function'
                    ? module.getName()
                    : module.name;

            // Use the reference key from Definition.modules if available,
            // otherwise fall back to moduleName
            const key = moduleNameToKey[moduleName] || moduleName;

            if (key) {
                modules[key] = module;
                this[key] = module;
            }

            // Wire the Delegate pattern so Module can notify this integration
            // of events it cannot handle itself (e.g. credential invalidation
            // needing an Integration.status flip). Without this, Module.notify
            // silently no-ops and Integration.status never updates on auth
            // failure.
            if (module && typeof module === 'object') {
                module.delegate = this;
            }
        }

        return modules;
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
        // todo: not sure we should call the repository directly from here
        return this.integrationMappingRepository.findMappingBy(
            this.id,
            sourceId
        );
    }

    async upsertMapping(sourceId, mapping) {
        if (!sourceId) {
            throw new Error(`sourceId must be set`);
        }
        // todo: not sure we should call the repository directly from here
        return await this.integrationMappingRepository.upsertMapping(
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

    async onUpdate(params) {
        return this.validateConfig();
    }

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

    /**
     * WEBHOOK EVENT HANDLERS
     */
    async onWebhookReceived({ req, res }) {
        // Default: queue webhook for processing
        const body = req.body;
        const integrationId = req.params.integrationId || null;

        await this.queueWebhook({
            integrationId,
            body,
            headers: req.headers,
            query: req.query,
        });

        res.status(200).json({ received: true });
    }

    async onWebhook({ data }) {
        // Default: no-op, integrations override this
    }

    async queueWebhook(data) {
        const { QueuerUtil } = require('../queues');

        const queueName = `${this.constructor.Definition.name
            .toUpperCase()
            .replace(/-/g, '_')}_QUEUE_URL`;
        const queueUrl = process.env[queueName];

        if (!queueUrl) {
            throw new Error(`Queue URL not found for ${queueName}`);
        }

        return QueuerUtil.send(
            {
                event: 'ON_WEBHOOK',
                data,
            },
            queueUrl
        );
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

    registerEventHandlers() {
        this.on = {
            ...this.defaultEvents,
            ...this.events,
        };
    }

    async initialize() {
        try {
            const additionalUserActions = await this.loadDynamicUserActions();
            this.events = { ...this.events, ...additionalUserActions };
        } catch (e) {
            this.addError(e);
        }

        this.registerEventHandlers();
    }

    async send(event, object) {
        if (!this.on[event]) {
            throw new Error(
                `Event ${event} is not defined in the Integration event object`
            );
        }
        return this.on[event].handler.call(this, object);
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

    /**
     * Receives notifications from modules (the Delegate pattern) when
     * something integration-level needs attention. Today this catches the
     * `CREDENTIAL_INVALIDATED` event Module fires from `markCredentialsInvalid`
     * and flips this integration's status to DISABLED so the queue worker
     * stops processing further webhooks until the user re-authorizes.
     *
     * Modules are wired to this delegate in `_appendModules()`, which runs
     * during `setIntegrationRecord()` — this covers every construction path
     * (HTTP read, queue worker, create/update/delete flows, etc.).
     *
     * The delegate string below must match `Module.DLGT_CREDENTIAL_INVALIDATED`
     * in `packages/core/modules/module.js`.
     *
     * @param {Object} notifier - The module that fired the event
     * @param {string} delegateString - Event type string
     * @param {Object} [object] - Optional event payload
     * @returns {Promise<void>}
     */
    async receiveNotification(notifier, delegateString, object = null) {
        if (delegateString !== 'CREDENTIAL_INVALIDATED') return;
        if (!this.id) return;
        console.log(
            `[Frigg] Module ${notifier?.name || '?'} reported invalid credentials for integration ${this.id} — marking ERROR`
        );
        await this.updateIntegrationStatus.execute(this.id, 'ERROR');
        this.status = 'ERROR';
    }
}

module.exports = { IntegrationBase };
