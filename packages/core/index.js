const {
    expectShallowEqualDbObject,
    get,
    getAll,
    verifyType,
    getParamAndVerifyParamType,
    getArrayParamAndVerifyParamType,
    getAndVerifyType,
} = require('./assertions/index');
const  { Delegate, Worker, loadInstalledModules, createHandler } = require('./core/index');
const {
    mongoose,
    connectToDatabase,
    disconnectFromDatabase,
    createObjectId,
    IndividualUser,
    OrganizationUser,
    State,
    Token,
    UserModel
} = require('./database/index');
const { Encrypt, Cryptor } = require('./encrypt/encrypt');
const {
    BaseError,
    FetchError,
    HaltError,
    RequiredPropertyError,
    ParameterTypeError,
} =  require('./errors/index');
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
    createMockIntegration,
    createMockApiObject
} = require('./integrations/index');
const { TimeoutCatcher } = require('./lambda/index');
const {
    debug,
    initDebugLog,
    flushDebugLog
} = require('./logs/index');
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
    testAutherDefinition,
    testDefinitionRequiredAuthMethods
} = require('./module-plugin/index');

// const {Sync } = require('./syncs/model');

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
    Auther
}