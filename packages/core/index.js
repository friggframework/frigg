const {
    expectShallowEqualDbObject,
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

// const {Sync } = require('./syncs/model');

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

module.exports = {
    // assertions
    expectShallowEqualDbObject,
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

    // database (lazy-loaded: MongoDB/Mongoose symbols only resolve when accessed)
    get mongoose() { return require('./database/index').mongoose; },
    get connectToDatabase() { return require('./database/index').connectToDatabase; },
    get disconnectFromDatabase() { return require('./database/index').disconnectFromDatabase; },
    get createObjectId() { return require('./database/index').createObjectId; },
    get IndividualUser() { return require('./database/index').IndividualUser; },
    get OrganizationUser() { return require('./database/index').OrganizationUser; },
    get State() { return require('./database/index').State; },
    get Token() { return require('./database/index').Token; },
    get UserModel() { return require('./database/index').UserModel; },
    get WebsocketConnection() { return require('./database/index').WebsocketConnection; },
    prisma,
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
    get Entity() { return require('./modules/entity').Entity; },
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

    // utils
    ...utils,
};
