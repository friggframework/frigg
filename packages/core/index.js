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
    mongoose,
    connectToDatabase,
    disconnectFromDatabase,
    createObjectId,
    IndividualUser,
    OrganizationUser,
    State,
    Token,
    UserModel,
    WebsocketConnection,
    prisma,
    TokenRepository,
    WebsocketConnectionRepository,
} = require('./database/index');
const {
    createUserRepository,
    UserRepositoryMongo,
    UserRepositoryPostgres,
} = require('./user/repositories/user-repository-factory');

const {
    CredentialRepository,
} = require('./credential/repositories/credential-repository');
const {
    ModuleRepository,
} = require('./modules/repositories/module-repository');
const {
    IntegrationMappingRepository,
} = require('./integrations/repositories/integration-mapping-repository');
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

// const {Sync } = require('./syncs/model');

const { QueuerUtil } = require('./queues');

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

    // database
    mongoose,
    connectToDatabase,
    disconnectFromDatabase,
    createObjectId,
    IndividualUser,
    OrganizationUser,
    State,
    Token,
    UserModel,
    WebsocketConnection,
    prisma,
    TokenRepository,
    WebsocketConnectionRepository,
    createUserRepository,
    UserRepositoryMongo,
    UserRepositoryPostgres,
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

    // application - Command factories for integration developers
    application,
    createFriggCommands: application.createFriggCommands,
    createIntegrationCommands: application.createIntegrationCommands,
    createUserCommands: application.createUserCommands,
    createEntityCommands: application.createEntityCommands,
    createCredentialCommands: application.createCredentialCommands,
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
