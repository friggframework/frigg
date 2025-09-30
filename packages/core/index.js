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
} = require('./database/index');
const { Encrypt, Cryptor } = require('./encrypt/encrypt');
const {
    BaseError,
    FetchError,
    HaltError,
    RequiredPropertyError,
    ParameterTypeError,
} = require('./errors/index');
const {
    IntegrationBase,
    IntegrationModel,
    Options,
    IntegrationMapping,
    createIntegrationRouter,
    checkRequiredParams,
    IntegrationRepository,
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
    ModuleRepository,
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

    // encrypt
    Encrypt,
    Cryptor,

    // errors
    BaseError,
    FetchError,
    HaltError,
    RequiredPropertyError,
    ParameterTypeError,

    // integrations
    IntegrationBase,
    IntegrationModel,
    Options,
    IntegrationMapping,
    checkRequiredParams,
    createIntegrationRouter,
    IntegrationRepository,
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
    ModuleRepository,
    // queues
    QueuerUtil,

    // utils
    ...utils,
};
