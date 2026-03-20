/* eslint-disable @typescript-eslint/no-require-imports */

// === Converted TypeScript modules ===

// assertions
export {
    get,
    getAll,
    verifyType,
    getParamAndVerifyParamType,
    getArrayParamAndVerifyParamType,
    getAndVerifyType,
} from './assertions';
export type { TypeOfType } from './assertions';
export {
    createApp,
    createAppHandler,
    loadAppDefinition,
    IntegrationEventDispatcher,
    loadRouterFromObject,
    createQueueWorker,
    databaseMigrationHandler,
    CheckExternalApisHealthUseCase,
    CheckIntegrationsHealthUseCase,
} from './handlers';
export type {
    MiddlewareApplier,
    IntegrationClass as HandlerIntegrationClass,
    UserConfig,
    AppDefinition,
    IntegrationInstance,
    DispatchHttpParams,
    DispatchJobParams,
    RouteDefinition,
    MigrationEvent,
    MigrationContext,
    MigrationResult as HandlerMigrationResult,
    ApiDefinition,
    ApiCheckResult,
    ExternalApisHealthResult,
    IntegrationsHealthResult,
    CheckIntegrationsHealthDeps,
} from './handlers';

// core
export { Delegate, Worker, loadInstalledModules, createHandler, secretsToEnv } from './core';
export type {
    DelegateParams,
    SQSRecord,
    WorkerRunParams,
    WorkerSendParams,
    LambdaEvent,
    LambdaContext,
    LambdaResponse,
    HandlerMethod,
    CreateHandlerOptions,
} from './core';

// encrypt
export { Cryptor } from './encrypt';
export type { CryptorOptions } from './encrypt';

// errors
export {
    BaseError,
    ClientSafeError,
    FetchError,
    HaltError,
    RequiredPropertyError,
    ParameterTypeError,
} from './errors';
export type {
    FetchErrorInit,
    FetchErrorResponse,
    FetchErrorOptions,
    RequiredPropertyErrorOptions,
    ParameterTypeErrorOptions,
} from './errors';

// lambda
export { TimeoutCatcher } from './lambda';
export type { TimeoutCatcherOptions } from './lambda';

// logs
export { debug, initDebugLog, flushDebugLog } from './logs';
export type { LogEntry } from './logs';

// utils
export { findNearestBackendPackageJson, validateBackendPath } from './utils';

// associations
export { Association } from './associations';
export type { AssociationConfig, AssociationConstructorParams } from './associations';

// application - Command factories
import * as application from './application';
export {
    createFriggCommands,
    createIntegrationCommands,
    createUserCommands,
    createEntityCommands,
    createCredentialCommands,
    createSchedulerCommands,
    findIntegrationContextByExternalEntityId,
    integrationCommands,
} from './application';
export { application };
export type {
    FriggCommands,
    IntegrationClass,
    IntegrationCommands,
    IntegrationContext,
    IntegrationRecord,
    CreateIntegrationParams,
    UpdateIntegrationConfigParams,
    DeleteIntegrationResult,
    ErrorResponse,
    UserCommands,
    UserRecord,
    OrganizationUserRecord,
    CreateUserParams,
    DeleteUserResult,
    EntityCommands,
    EntityRecord,
    CreateEntityParams,
    EntityFilter,
    CredentialCommands,
    CredentialRecord,
    CreateCredentialParams,
    CredentialFilter,
    SchedulerCommands,
    SchedulerService,
    ScheduleJobParams,
    ScheduleJobResult,
    DeleteJobResult,
    JobStatusResult,
    CreateSchedulerCommandsParams,
} from './application';

// database
export {
    config as databaseConfig,
    getDatabaseType,
    getDbType,
    prisma,
    connectPrisma,
    disconnectPrisma,
    getEncryptionConfig,
    ensureMongoDbUrl,
    logger as encryptionLogger,
    EncryptionLogger,
    CORE_ENCRYPTION_SCHEMA,
    getEncryptedFields,
    hasEncryptedFields,
    getEncryptedModels,
    registerCustomSchema,
    loadCustomEncryptionSchema,
    loadModuleEncryptionSchemas,
    extractCredentialFieldsFromModules,
    validateCustomSchema,
    resetCustomSchema,
    FieldEncryptionService,
    createEncryptionExtension,
    HealthCheckRepositoryInterface,
    HealthCheckRepositoryMongoDB,
    HealthCheckRepositoryPostgreSQL,
    HealthCheckRepositoryDocumentDB,
    createHealthCheckRepository,
    CheckDatabaseHealthUseCase,
    CheckDatabaseStateUseCase,
    CheckEncryptionHealthUseCase,
    TestEncryptionUseCase,
    GetDatabaseStateViaWorkerUseCase,
    GetMigrationStatusUseCase,
    RunDatabaseMigrationUseCase,
    TriggerDatabaseMigrationUseCase,
    MigrationError,
    NotFoundError,
    LambdaInvoker,
    LambdaInvocationError,
    DocumentDBEncryptionService,
    toObjectId,
    fromObjectId,
    ensureCollectionExists,
    ensureCollectionsExist,
    initializeMongoDBSchema,
    getPrismaSchemaPath,
} from './database';
export type {
    DatabaseType,
    PrismaClientLike,
    EncryptionConfig,
    EncryptionModelConfig,
    EncryptionSchema,
    EncryptionSchemaProvider,
    DatabaseConnectionState,
    CredentialData,
    MigrationStatusRepositoryS3,
    MigrationStatus,
    CreateMigrationStatusData,
    UpdateMigrationStatusData,
    DatabaseHealthResult,
    EncryptionHealthResult,
    EncryptionTestResult,
    MigrationResult,
    TriggerMigrationResult,
} from './database';

// user
export {
    User,
    UserRepositoryInterface,
    UserRepositoryMongo,
    UserRepositoryPostgres,
    UserRepositoryDocumentDB,
    createUserRepository,
    AuthenticateUser,
    AuthenticateWithSharedSecret,
    CreateIndividualUser,
    CreateOrganizationUser,
    CreateTokenForUserId,
    GetUserFromAdopterJwt,
    GetUserFromBearerToken,
    GetUserFromXFriggHeaders,
    LoginUser,
} from './user';
export type {
    UserData,
    UserConfig as UserEntityConfig,
    SessionToken,
    CreateIndividualUserParams,
    CreateOrganizationUserParams,
} from './user';

// credential
export {
    CredentialRepositoryInterface,
    CredentialRepository,
    CredentialRepositoryMongo,
    CredentialRepositoryPostgres,
    CredentialRepositoryDocumentDB,
    createCredentialRepository,
    GetCredentialForUser,
    UpdateAuthenticationStatus,
} from './credential';
export type {
    CredentialData as CredentialRepoData,
    CredentialIdentifiers,
    CredentialUpsertParams,
    CredentialFilter as CredentialRepoFilter,
    MutationResult,
} from './credential';

// token
export {
    TokenRepositoryInterface,
    TokenRepository,
    TokenRepositoryMongo,
    TokenRepositoryPostgres,
    TokenRepositoryDocumentDB,
    createTokenRepository,
} from './token';
export type {
    TokenData,
    TokenObj,
    DeleteResult as TokenDeleteResult,
} from './token';

// websocket
export {
    WebsocketConnectionRepositoryInterface,
    WebsocketConnectionRepository,
    WebsocketConnectionRepositoryMongo,
    WebsocketConnectionRepositoryPostgres,
    WebsocketConnectionRepositoryDocumentDB,
    createWebsocketConnectionRepository,
} from './websocket';
export type {
    ConnectionData,
    ActiveConnection,
    ConnectionDeleteResult,
} from './websocket';

// syncs
export {
    Sync,
    SyncManager,
    SyncRepositoryInterface,
    SyncRepositoryMongo,
    SyncRepositoryPostgres,
    SyncRepositoryDocumentDB,
    createSyncRepository,
} from './syncs';
export type {
    SyncConfig,
    SyncParams,
    SyncManagerParams,
    SyncData,
    SyncDataIdentifier,
    SyncFilter,
} from './syncs';

// queues
export { QueuerUtil } from './queues';

// infrastructure
// Note: EventBridgeSchedulerAdapter and MockSchedulerAdapter are NOT re-exported here
// to avoid requiring @aws-sdk/client-scheduler at module load time.
// Use createSchedulerService() factory instead.
export {
    SchedulerServiceInterface,
    createSchedulerService,
    SCHEDULER_PROVIDERS,
    determineProvider,
} from './infrastructure';
export type {
    ScheduleOneTimeParams,
    ScheduleOneTimeResult,
    ScheduleStatusResult,
    CreateSchedulerServiceOptions,
} from './infrastructure';

const moduleRepo = require('../modules/repositories/module-repository');
export const ModuleRepository: unknown = moduleRepo.ModuleRepository;

// integrations (converted to TypeScript)
export {
    IntegrationBase,
    Options,
    createIntegrationRouter,
    checkRequiredParams,
    getModulesDefinitionFromIntegrationClasses,
    mapIntegrationClassToIntegrationDTO,
    LoadIntegrationContextUseCase,
    FindIntegrationContextByExternalEntityIdUseCase,
    CreateIntegration,
    DeleteIntegrationForUser,
    GetIntegrationsForUser,
    GetIntegrationForUser,
    GetIntegrationInstance,
    GetIntegrationInstanceByDefinition,
    UpdateIntegration,
    UpdateIntegrationStatus,
    UpdateIntegrationMessages,
    GetPossibleIntegrations,
    CreateProcess,
    GetProcess,
    UpdateProcessState,
    UpdateProcessMetrics,
    IntegrationRepositoryInterface,
    IntegrationMappingRepositoryInterface,
    ProcessRepositoryInterface,
    createIntegrationRepository,
    createIntegrationMappingRepository,
    createProcessRepository,
    IntegrationMappingRepository,
    IntegrationMappingRepositoryMongo,
    IntegrationMappingRepositoryPostgres,
    IntegrationMappingRepositoryDocumentDB,
    IntegrationRepositoryMongo,
    IntegrationRepositoryPostgres,
    IntegrationRepositoryDocumentDB,
    ProcessRepositoryMongo,
    ProcessRepositoryPostgres,
    ProcessRepositoryDocumentDB,
} from './integrations';
export type {
    IntegrationModuleDefinition,
    IntegrationDisplay,
    IntegrationDefinition,
    IntegrationMessages,
    IntegrationMessage,
    IntegrationRecord as IntegrationRecordType,
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
    IntegrationClass as IntegrationClassType,
    DeletionResult,
    IntegrationMappingRecord,
    ProcessRecord,
    ProcessData,
    MetricsUpdate,
} from './integrations';

const modulesIndex = require('../modules/index');
export const Credential: unknown = modulesIndex.Credential;
export const Entity: unknown = modulesIndex.Entity;
export const ApiKeyRequester: unknown = modulesIndex.ApiKeyRequester;
export const BasicAuthRequester: unknown = modulesIndex.BasicAuthRequester;
export const OAuth2Requester: unknown = modulesIndex.OAuth2Requester;
export const Requester: unknown = modulesIndex.Requester;
export const ModuleConstants: unknown = modulesIndex.ModuleConstants;
export const ModuleFactory: unknown = modulesIndex.ModuleFactory;

