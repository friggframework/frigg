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
    IntegrationFactory,
    IntegrationHelper,
    createIntegrationRouter,
    checkRequiredParams,
    createFriggBackend,
} = require('./integrations/index');
const { TimeoutCatcher } = require('./lambda/index');
const { debug, initDebugLog, flushDebugLog } = require('./logs/index');
const {
    Credential,
    EntityManager,
    Entity,
    ModuleManager,
    ApiKeyRequester,
    BasicAuthRequester,
    OAuth2Requester,
    Requester,
    ModuleConstants,
    ModuleFactory,
    Auther,
} = require('./module-plugin/index');
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
    IntegrationFactory,
    IntegrationHelper,
    checkRequiredParams,
    createIntegrationRouter,
    createFriggBackend,

    // lambda
    TimeoutCatcher,

    // logs
    debug,
    initDebugLog,
    flushDebugLog,

    // module plugin
    Credential,
    EntityManager,
    Entity,
    ModuleManager,
    ApiKeyRequester,
    BasicAuthRequester,
    OAuth2Requester,
    Requester,
    ModuleConstants,
    ModuleFactory,
    Auther,

    // queues
    QueuerUtil,

    // utils
    ...utils,
};
