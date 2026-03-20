import type { Request, Response } from 'express';
import { Options } from './options';
import type {
    IntegrationDefinition,
    IntegrationConstructorParams,
    IntegrationMessages,
    IntegrationConfig,
    IntegrationModule,
    IntegrationEvents,
    SchemaOptions,
    WebhookData,
    OptionDetails,
} from './types';

const {
    createIntegrationMappingRepository,
} = require('./repositories/integration-mapping-repository-factory');
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
        WEBHOOK_RECEIVED: 'WEBHOOK_RECEIVED',
        ON_WEBHOOK: 'ON_WEBHOOK',
    },
    types: {
        LIFE_CYCLE_EVENT: 'LIFE_CYCLE_EVENT' as const,
        USER_ACTION: 'USER_ACTION' as const,
    },
};

interface IntegrationRecord {
    id: string;
    userId: string;
    entities: string[] | unknown[];
    config: IntegrationConfig;
    status: string;
    version: string;
    messages: IntegrationMessages;
}

export class IntegrationBase {
    integrationRepository = createIntegrationRepository();
    integrationMappingRepository = createIntegrationMappingRepository();
    updateIntegrationStatus = new UpdateIntegrationStatus({
        integrationRepository: this.integrationRepository,
    });
    updateIntegrationMessages = new UpdateIntegrationMessages({
        integrationRepository: this.integrationRepository,
    });

    static readonly Definition: IntegrationDefinition = {
        name: 'Integration Name',
        version: '0.0.0',
        supportedVersions: [],
        modules: {},
        display: {
            name: 'Integration Name',
            logo: '',
            description: '',
        },
    };

    id: string | undefined;
    userId: string | undefined;
    entities: string[] | unknown[] | undefined;
    config: IntegrationConfig | undefined;
    status: string | undefined;
    version: string | undefined;
    messages: IntegrationMessages;
    modules: Record<string, IntegrationModule>;
    events: IntegrationEvents;
    defaultEvents: IntegrationEvents;
    on: IntegrationEvents | undefined;
    record: IntegrationRecord | undefined;
    userActions: unknown;

    private _isHydrated: boolean;

    // Allow dynamic property access for modules
    [key: string]: unknown;

    static getOptionDetails(): OptionDetails {
        const options = new Options({
            module: Object.values(this.Definition.modules)[0],
            ...this.Definition,
        });
        return options.get();
    }

    static getName(): string {
        return this.Definition.name;
    }

    static getCurrentVersion(): string {
        return this.Definition.version;
    }

    constructor(params: IntegrationConstructorParams = {}) {
        this.modules = {};
        this.events = (this as unknown as { events: IntegrationEvents }).events || {};
        this.messages = { errors: [], warnings: [] };
        this._isHydrated = false;

        if (params && Object.keys(params).length > 0) {
            this.setIntegrationRecord({
                record: {
                    id: params.id as string,
                    userId: params.userId as string,
                    entities: params.entities as string[],
                    config: params.config as IntegrationConfig,
                    status: params.status as string,
                    version: params.version as string,
                    messages: params.messages as IntegrationMessages,
                },
                modules: (params.modules as IntegrationModule[]) || [],
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

    setIntegrationRecord(payload: {
        record?: IntegrationRecord;
        modules?: IntegrationModule[];
    } = {}): this {
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
            id: this.id as string,
            userId: this.userId as string,
            entities: this.entities as string[],
            config: this.config as IntegrationConfig,
            status: this.status as string,
            version: this.version as string,
            messages: this.messages,
        };

        this._isHydrated = Boolean(this.id);
        return this;
    }

    get isHydrated(): boolean {
        return this._isHydrated;
    }

    assertHydrated(message = 'Integration instance is not hydrated'): void {
        if (!this.isHydrated) {
            throw new Error(message);
        }
    }

    private _appendModules(integrationModules: IntegrationModule[]): Record<string, IntegrationModule> {
        const modules: Record<string, IntegrationModule> = {};

        const moduleNameToKey: Record<string, string> = {};
        const ctor = this.constructor as typeof IntegrationBase;
        if (ctor.Definition?.modules) {
            for (const [key, moduleConfig] of Object.entries(ctor.Definition.modules)) {
                const definition = moduleConfig.definition;
                if (definition) {
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

            const key = (moduleName && moduleNameToKey[moduleName]) || moduleName;

            if (key) {
                modules[key] = module;
                (this as Record<string, unknown>)[key] = module;
            }
        }

        return modules;
    }

    async validateConfig(): Promise<void> {
        const configOptions = await this.getConfigOptions();
        const currentConfig = this.getConfig();
        let needsConfig = false;
        for (const option of configOptions as Array<{ required?: boolean; key: string; label: string }>) {
            if (option.required) {
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

    async testAuth(): Promise<void> {
        let didAuthPass = true;
        const ctor = this.constructor as typeof IntegrationBase;

        for (const module of Object.keys(ctor.Definition.modules)) {
            try {
                await (this as Record<string, IntegrationModule>)[module].testAuth!();
            } catch {
                didAuthPass = false;
                await this.updateIntegrationMessages.execute(
                    this.id,
                    'errors',
                    'Authentication Error',
                    `There was an error with your ${
                        (this as Record<string, IntegrationModule>)[module].constructor.getName()
                    } Entity.
                Please reconnect/re-authenticate, or reach out to Support for assistance.`,
                    Date.now()
                );
            }
        }

        if (!didAuthPass) {
            await this.updateIntegrationStatus.execute(this.id, 'ERROR');
        }
    }

    async getMapping(sourceId: string): Promise<unknown> {
        return this.integrationMappingRepository.findMappingBy(
            this.id,
            sourceId
        );
    }

    async upsertMapping(sourceId: string, mapping: unknown): Promise<unknown> {
        if (!sourceId) {
            throw new TypeError('sourceId must be set');
        }
        return await this.integrationMappingRepository.upsertMapping(
            this.id,
            sourceId,
            mapping
        );
    }

    async onCreate({ integrationId }: { integrationId: string }): Promise<void> {
        await this.updateIntegrationStatus.execute(integrationId, 'ENABLED');
    }

    async onUpdate(_params?: unknown): Promise<void> {
        await this.validateConfig();
    }

    async onDelete(_params?: unknown): Promise<void> {}

    async getConfigOptions(): Promise<SchemaOptions | unknown[]> {
        const options: SchemaOptions = {
            jsonSchema: {},
            uiSchema: {},
        };
        return options;
    }

    async refreshConfigOptions(_params?: unknown): Promise<SchemaOptions> {
        const options: SchemaOptions = {
            jsonSchema: {},
            uiSchema: {},
        };
        return options;
    }

    async loadDynamicUserActions(): Promise<IntegrationEvents> {
        return {};
    }

    async loadUserActions({ actionType }: { actionType?: string } = {}): Promise<IntegrationEvents> {
        const userActions: IntegrationEvents = {};
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

    async getActionOptions(_actionId?: string, _data?: unknown): Promise<SchemaOptions> {
        const options: SchemaOptions = {
            jsonSchema: {},
            uiSchema: {},
        };
        return options;
    }

    async refreshActionOptions(_params?: unknown): Promise<SchemaOptions> {
        const options: SchemaOptions = {
            jsonSchema: {},
            uiSchema: {},
        };
        return options;
    }

    async onWebhookReceived({ req, res }: { req: Request; res: Response }): Promise<void> {
        const body = req.body;
        const integrationId = req.params.integrationId || null;

        await this.queueWebhook({
            integrationId,
            body,
            headers: req.headers as Record<string, string | string[] | undefined>,
            query: req.query as Record<string, string | string[] | undefined>,
        });

        res.status(200).json({ received: true });
    }

    async onWebhook(_data?: { data: unknown }): Promise<void> {}

    async queueWebhook(data: WebhookData): Promise<unknown> {
        const { QueuerUtil } = require('../queues');
        const ctor = this.constructor as typeof IntegrationBase;

        const queueName = `${ctor.Definition.name
            .toUpperCase()
            .replaceAll('-', '_')}_QUEUE_URL`;
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

    getConfig(): IntegrationConfig | undefined {
        return this.config;
    }

    getModule(key: string): IntegrationModule | undefined {
        return this.modules[key];
    }

    setModule(key: string, module: IntegrationModule): void {
        this.modules[key] = module;
        (this as Record<string, unknown>)[key] = module;
    }

    addError(error: IntegrationMessages['errors'][0]): void {
        if (!this.messages.errors) {
            this.messages.errors = [];
        }
        this.messages.errors.push(error);
        this.status = 'ERROR';
    }

    addWarning(warning: IntegrationMessages['warnings'][0]): void {
        if (!this.messages.warnings) {
            this.messages.warnings = [];
        }
        this.messages.warnings.push(warning);
    }

    isActive(): boolean {
        return this.status === 'ENABLED' || this.status === 'ACTIVE';
    }

    needsConfiguration(): boolean {
        return this.status === 'NEEDS_CONFIG';
    }

    hasErrors(): boolean {
        return this.status === 'ERROR';
    }

    belongsToUser(userId: string): boolean {
        return String(this.userId) === String(userId);
    }

    registerEventHandlers(): void {
        this.on = {
            ...this.defaultEvents,
            ...this.events,
        };
    }

    async initialize(): Promise<void> {
        try {
            const additionalUserActions = await this.loadDynamicUserActions();
            this.events = { ...this.events, ...additionalUserActions };
        } catch (e) {
            this.addError(e as IntegrationMessages['errors'][0]);
        }

        this.registerEventHandlers();
    }

    async send(event: string, object?: unknown): Promise<unknown> {
        if (!this.on?.[event]) {
            throw new Error(
                `Event ${event} is not defined in the Integration event object`
            );
        }
        return this.on[event].handler.call(this, object);
    }

    getOptionDetails(): OptionDetails {
        const ctor = this.constructor as typeof IntegrationBase;
        const options = new Options({
            module: Object.values(ctor.Definition.modules)[0],
            ...ctor.Definition,
        });
        return options.get();
    }

    async loadModules(): Promise<void> {
        return;
    }
}
