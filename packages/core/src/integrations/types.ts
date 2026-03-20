import type { Request, Response } from 'express';

export interface IntegrationModuleDefinition {
    definition: {
        getName: () => string;
        moduleName?: string;
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

export interface IntegrationDisplay {
    name: string;
    label?: string;
    logo?: string;
    description?: string;
    detailsUrl?: string;
    icon?: string;
    [key: string]: unknown;
}

export interface IntegrationDefinition {
    name: string;
    version: string;
    supportedVersions: string[];
    modules: Record<string, IntegrationModuleDefinition>;
    display: IntegrationDisplay;
    isMany?: boolean;
    hasUserConfig?: boolean;
    requiresNewEntity?: boolean;
    [key: string]: unknown;
}

export interface IntegrationMessages {
    errors: IntegrationMessage[];
    warnings: IntegrationMessage[];
    info?: IntegrationMessage[];
    logs?: IntegrationMessage[];
    [key: string]: IntegrationMessage[] | undefined;
}

export interface IntegrationMessage {
    title?: string;
    message: string;
    timestamp: number | string | Date;
}

export interface IntegrationRecord {
    id: string;
    userId: string;
    entitiesIds: string[];
    config: IntegrationConfig;
    status: string;
    version: string;
    messages: IntegrationMessages;
}

export interface IntegrationConfig {
    type: string;
    [key: string]: unknown;
}

export interface IntegrationConstructorParams {
    id?: string;
    userId?: string;
    entities?: string[];
    config?: IntegrationConfig;
    status?: string;
    version?: string;
    messages?: IntegrationMessages;
    modules?: IntegrationModule[] | unknown[];
    [key: string]: unknown;
}

export interface IntegrationModule {
    getName?: () => string;
    name?: string;
    testAuth?: () => Promise<void>;
    api?: unknown;
    getEntityDetails?: (api: unknown, ...args: unknown[]) => Promise<unknown>;
    findOrCreateEntity?: (details: unknown) => Promise<unknown>;
    constructor: {
        getName: () => string;
        [key: string]: unknown;
    };
    [key: string]: unknown;
}

export type IntegrationEventType = 'LIFE_CYCLE_EVENT' | 'USER_ACTION';

export interface IntegrationEventHandler {
    type: IntegrationEventType;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    handler: (...args: any[]) => Promise<unknown>;
    userActionType?: string;
    [key: string]: unknown;
}

export interface IntegrationEvents {
    [key: string]: IntegrationEventHandler;
}

export interface SchemaOptions {
    jsonSchema: Record<string, unknown>;
    uiSchema: Record<string, unknown>;
}

export interface WebhookData {
    integrationId: string | null;
    body: unknown;
    headers: Record<string, string | string[] | undefined>;
    query: Record<string, string | string[] | undefined>;
}

export interface IntegrationDTO {
    id: string | undefined;
    userId: string | undefined;
    entities: string[] | unknown[] | undefined;
    config: IntegrationConfig | undefined;
    status: string | undefined;
    version: string | undefined;
    messages: IntegrationMessages;
    userActions: unknown;
    options: unknown;
}

export interface OptionDetails {
    type: string;
    hasUserConfig: boolean;
    isMany: boolean;
    requiresNewEntity: boolean;
    display: {
        name: string;
        description: string;
        detailsUrl: string;
        icon: string;
    };
}

export type IntegrationClass = {
    new (params?: IntegrationConstructorParams): IntegrationBase;
    Definition: IntegrationDefinition;
    getName: () => string;
    getCurrentVersion: () => string;
    getOptionDetails: () => OptionDetails;
};

// Forward reference - actual class is defined in integration-base.ts
export type IntegrationBase = import('./integration-base').IntegrationBase;

export interface DeletionResult {
    acknowledged: boolean;
    deletedCount: number;
}

export interface IntegrationMappingRecord {
    id: string;
    integrationId: string;
    sourceId: string | null;
    mapping: unknown;
    createdAt?: Date;
    updatedAt?: Date;
}

export interface ProcessRecord {
    id: string;
    userId: string;
    integrationId: string;
    name: string;
    type: string;
    state: string;
    context: Record<string, unknown>;
    results: Record<string, unknown>;
    childProcesses: string[];
    parentProcessId: string | null;
    createdAt: Date | null;
    updatedAt: Date | null;
}

export interface ProcessData {
    userId: string;
    integrationId: string;
    name: string;
    type: string;
    state?: string;
    context?: Record<string, unknown>;
    results?: Record<string, unknown>;
    childProcesses?: string[];
    parentProcessId?: string;
}

export interface MetricsUpdate {
    processed?: number;
    success?: number;
    errors?: number;
    errorDetails?: Array<Record<string, unknown>>;
}
