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
    UserRepositoryPostgres,
} = require('./user/repositories/user-repository-factory');
const {
    GetUserFromXFriggHeaders,
} = require('./user/use-cases/get-user-from-x-frigg-headers');
const {
    GetUserFromAdopterJwt,
} = require('./user/use-cases/get-user-from-adopter-jwt');
const { AuthenticateUser } = require('./user/use-cases/authenticate-user');

const {
    CredentialRepository,
} = require('./credential/repositories/credential-repository');
const {
    ModuleRepository,
} = require('./modules/repositories/module-repository');
const {
    IntegrationMappingRepository,
} = require('./integrations/repositories/integration-mapping-repository');
const { CreateProcess } = require('./integrations/use-cases/create-process');
const {
    UpdateProcessState,
} = require('./integrations/use-cases/update-process-state');
const {
    UpdateProcessMetrics,
} = require('./integrations/use-cases/update-process-metrics');
const { GetProcess } = require('./integrations/use-cases/get-process');
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
    createProcessRepository,
} = require('./integrations/index');
const { TimeoutCatcher } = require('./lambda/index');
const { debug, initDebugLog, flushDebugLog } = require('./logs/index');
const {
    ApiKeyRequester,
    BasicAuthRequester,
    OAuth2Requester,
    Requester,
    ModuleConstants,
    ModuleFactory,
} = require('./modules/index');
const application = require('./application');
const utils = require('./utils');

const {
    QueuerUtil,
    QueueProvider,
    QueueClientInterface,
    createQueueProvider,
    QUEUE_PROVIDERS,
} = require('./queues');

const {
    EncryptionKeyProviderInterface,
} = require('./encrypt/encryption-key-provider-interface');
const {
    AesEncryptionKeyProvider,
} = require('./encrypt/aes-encryption-key-provider');
const {
    WebSocketMessageSenderInterface,
    StaleConnectionError,
} = require('./websocket/websocket-message-sender-interface');

const {
    resolveProvider,
    determineProviderName,
    providerPackageName,
    KNOWN_PROVIDERS,
} = require('./providers');

const extensions = require('./extensions');

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
    get UserRepositoryMongo() { return require('./user/repositories/user-repository-factory').UserRepositoryMongo; },
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
    createProcessRepository,

    // application - Command factories for integration developers
    application,
    createFriggCommands: application.createFriggCommands,
    createIntegrationCommands: application.createIntegrationCommands,
    createUserCommands: application.createUserCommands,
    createEntityCommands: application.createEntityCommands,
    createCredentialCommands: application.createCredentialCommands,
    createSchedulerCommands: application.createSchedulerCommands,
    createAdminScriptCommands: application.createAdminScriptCommands,
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
    ApiKeyRequester,
    BasicAuthRequester,
    OAuth2Requester,
    Requester,
    ModuleConstants,
    ModuleFactory,
    // queues
    QueuerUtil,
    QueueProvider,
    QueueClientInterface,
    createQueueProvider,
    QUEUE_PROVIDERS,

    // encryption interfaces
    EncryptionKeyProviderInterface,
    AesEncryptionKeyProvider,

    // websocket interfaces
    WebSocketMessageSenderInterface,
    StaleConnectionError,

    // providers
    resolveProvider,
    determineProviderName,
    providerPackageName,
    KNOWN_PROVIDERS,

    // extensions
    extensions,
    loadExtensions: extensions.loadExtensions,
    composeSchemas: extensions.composeSchemas,
    mountExtensionRoutes: extensions.mountExtensionRoutes,
    runExtensionBootstraps: extensions.runExtensionBootstraps,
    initializeApp: extensions.initializeApp,

    // utils
    ...utils,
};
