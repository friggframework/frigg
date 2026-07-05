const {
    get,
    getAll,
    verifyType,
    getParamAndVerifyParamType,
    getArrayParamAndVerifyParamType,
    getAndVerifyType,
} = require('./assertions/index');
const {
    Delegate,
    Worker,
    loadInstalledModules,
    createHandler,
} = require('./core/index');
const {
    prisma,
    connectPrisma,
    disconnectPrisma,
    TokenRepository,
    WebsocketConnectionRepository,
} = require('./database/index');
const {
    createUserRepository,
    UserRepositoryMongo,
    UserRepositoryPostgres,
} = require('./user/repositories/user-repository-factory');
const {
    GetUserFromXFriggHeaders,
} = require('./user/use-cases/get-user-from-x-frigg-headers');
const {
    GetUserFromAdopterJwt,
} = require('./user/use-cases/get-user-from-adopter-jwt');
const {
    AuthenticateUser,
} = require('./user/use-cases/authenticate-user');

const {
    CredentialRepository,
} = require('./credential/repositories/credential-repository');
const {
    ModuleRepository,
} = require('./modules/repositories/module-repository');
const {
    IntegrationMappingRepository,
} = require('./integrations/repositories/integration-mapping-repository');
const {
    CreateProcess,
} = require('./integrations/use-cases/create-process');
const {
    UpdateProcessState,
} = require('./integrations/use-cases/update-process-state');
const {
    UpdateProcessMetrics,
} = require('./integrations/use-cases/update-process-metrics');
const {
    GetProcess,
} = require('./integrations/use-cases/get-process');
const { Cryptor } = require('./encrypt');
const {
    BaseError,
    FetchError,
    HaltError,
    RequiredPropertyError,
    ParameterTypeError,
} = require('./errors/index');
const {
    IntegrationBase,
    Options,
    createIntegrationRouter,
    checkRequiredParams,
    getModulesDefinitionFromIntegrationClasses,
    LoadIntegrationContextUseCase,
} = require('./integrations/index');
const {
    createReportingRouter,
    createReportingRepository,
} = require('./reporting/index');
const { createTelemetry } = require('./telemetry/index');
const { createUsageRepository } = require('./usage/index');
const { TimeoutCatcher } = require('./lambda/index');
const { debug, initDebugLog, flushDebugLog } = require('./logs/index');
const {
    Credential,
    Entity,
    ApiKeyRequester,
    BasicAuthRequester,
    OAuth2Requester,
    Requester,
    ModuleConstants,
    ModuleFactory,
} = require('./modules/index');
const application = require('./application');
const utils = require('./utils');

const { QueuerUtil } = require('./queues');

module.exports = {
    // assertions
    get,
    getAll,
    verifyType,
    getParamAndVerifyParamType,
    getArrayParamAndVerifyParamType,
    getAndVerifyType,

    // core
    Delegate,
    Worker,
    loadInstalledModules,
    createHandler,

    // database
    prisma,
    connectPrisma,
    disconnectPrisma,
    TokenRepository,
    WebsocketConnectionRepository,
    createUserRepository,
    UserRepositoryMongo,
    UserRepositoryPostgres,
    GetUserFromXFriggHeaders,
    GetUserFromAdopterJwt,
    AuthenticateUser,
    CredentialRepository,
    ModuleRepository,
    IntegrationMappingRepository,
    Cryptor,

    // errors
    BaseError,
    FetchError,
    HaltError,
    RequiredPropertyError,
    ParameterTypeError,

    // integrations
    IntegrationBase,
    Options,
    checkRequiredParams,
    createIntegrationRouter,
    getModulesDefinitionFromIntegrationClasses,
    LoadIntegrationContextUseCase,
    CreateProcess,
    UpdateProcessState,
    UpdateProcessMetrics,
    GetProcess,

    // reporting
    createReportingRouter,
    createReportingRepository,

    // telemetry (ADR-011)
    createTelemetry,
    createUsageRepository,

    // application - Command factories for integration developers
    application,
    createFriggCommands: application.createFriggCommands,
    createIntegrationCommands: application.createIntegrationCommands,
    createUserCommands: application.createUserCommands,
    createEntityCommands: application.createEntityCommands,
    createCredentialCommands: application.createCredentialCommands,
    createProcessCommands: application.createProcessCommands,
    createSchedulerCommands: application.createSchedulerCommands,
    createUsageCommands: application.createUsageCommands,
    findIntegrationContextByExternalEntityId:
        application.findIntegrationContextByExternalEntityId,
    integrationCommands: application.integrationCommands,

    // lambda
    TimeoutCatcher,

    // logs
    debug,
    initDebugLog,
    flushDebugLog,

    // module plugin
    Credential,
    Entity,
    ApiKeyRequester,
    BasicAuthRequester,
    OAuth2Requester,
    Requester,
    ModuleConstants,
    ModuleFactory,
    // queues
    QueuerUtil,

    // utils
    ...utils,
};
