const { Credential } = require('./credential');
const { EntityManager } = require('./entity-manager');
const { Entity } = require('./entity');
const { ModuleManager } = require('./manager');
const { ApiKeyRequester } = require('./requester/api-key');
const { BasicAuthRequester } = require('./requester/basic');
const { OAuth2Requester } = require('./requester/oauth-2');
const { Requester } = require('./requester/requester');
const { ModuleConstants } = require('./ModuleConstants');
const { ModuleFactory } = require('./module-factory');
const { Auther } = require('./auther');
const { testAutherDefinition } = require('./auther-definition-tester');
const { testDefinitionRequiredAuthMethods } = require('./auther-definition-method-tester');

module.exports = {
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
};
