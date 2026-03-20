// Main classes
export { IntegrationBase } from './integration-base';
export { Options } from './options';

// Router
export { createIntegrationRouter, checkRequiredParams } from './integration-router';

// Types
export type {
    IntegrationModuleDefinition,
    IntegrationDisplay,
    IntegrationDefinition,
    IntegrationMessages,
    IntegrationMessage,
    IntegrationRecord,
    IntegrationConfig,
    IntegrationConstructorParams,
    IntegrationModule,
    IntegrationEventType,
    IntegrationEventHandler,
    IntegrationEvents,
    SchemaOptions,
    WebhookData,
    IntegrationDTO,
    OptionDetails,
    IntegrationClass,
    IntegrationBase as IntegrationBaseType,
    DeletionResult,
    IntegrationMappingRecord,
    ProcessRecord,
    ProcessData,
    MetricsUpdate,
} from './types';

// Utilities
export {
    mapIntegrationClassToIntegrationDTO,
    getModulesDefinitionFromIntegrationClasses,
} from './utils/map-integration-dto';

// Repository interfaces
export { IntegrationRepositoryInterface } from './repositories/integration-repository-interface';
export { IntegrationMappingRepositoryInterface } from './repositories/integration-mapping-repository-interface';
export { ProcessRepositoryInterface } from './repositories/process-repository-interface';

// Repository factories
export { createIntegrationRepository } from './repositories/integration-repository-factory';
export { createIntegrationMappingRepository } from './repositories/integration-mapping-repository-factory';
export { createProcessRepository } from './repositories/process-repository-factory';

// Repository implementations
export { IntegrationRepositoryMongo } from './repositories/integration-repository-mongo';
export { IntegrationRepositoryPostgres } from './repositories/integration-repository-postgres';
export { IntegrationRepositoryDocumentDB } from './repositories/integration-repository-documentdb';
export { IntegrationMappingRepositoryMongo } from './repositories/integration-mapping-repository-mongo';
export { IntegrationMappingRepositoryPostgres } from './repositories/integration-mapping-repository-postgres';
export { IntegrationMappingRepositoryDocumentDB } from './repositories/integration-mapping-repository-documentdb';
export { IntegrationMappingRepository } from './repositories/integration-mapping-repository';
export { ProcessRepositoryMongo } from './repositories/process-repository-mongo';
export { ProcessRepositoryPostgres } from './repositories/process-repository-postgres';
export { ProcessRepositoryDocumentDB } from './repositories/process-repository-documentdb';

// Use cases
export { CreateIntegration } from './use-cases/create-integration';
export { DeleteIntegrationForUser } from './use-cases/delete-integration-for-user';
export { GetIntegrationsForUser } from './use-cases/get-integrations-for-user';
export { GetIntegrationForUser } from './use-cases/get-integration-for-user';
export { GetIntegrationInstance } from './use-cases/get-integration-instance';
export { GetIntegrationInstanceByDefinition } from './use-cases/get-integration-instance-by-definition';
export { UpdateIntegration } from './use-cases/update-integration';
export { UpdateIntegrationStatus } from './use-cases/update-integration-status';
export { UpdateIntegrationMessages } from './use-cases/update-integration-messages';
export { GetPossibleIntegrations } from './use-cases/get-possible-integrations';
export { FindIntegrationContextByExternalEntityIdUseCase } from './use-cases/find-integration-context-by-external-entity-id';
export { LoadIntegrationContextUseCase } from './use-cases/load-integration-context';
export { CreateProcess } from './use-cases/create-process';
export { GetProcess } from './use-cases/get-process';
export { UpdateProcessState } from './use-cases/update-process-state';
export { UpdateProcessMetrics } from './use-cases/update-process-metrics';
