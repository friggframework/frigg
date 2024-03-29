const Authenticator = require('@friggframework/devtools/test/Authenticator')
const { createMockIntegration, createMockApiObject } = require('mock-integration');
const { testAutherDefinition } = require('./auther-definition-tester');
const { testDefinitionRequiredAuthMethods } = require('./auther-definition-method-tester');
const {  } = require('./../../utils/test-environment');
const {
    TestMongo,
    overrideEnvironment,
    restoreEnvironment,
    globalTeardown,
    globalSetup,
} = require('./../../../utils/test-environment');

module.exports = {
    createMockIntegration,
    createMockApiObject,
    testDefinitionRequiredAuthMethods,
    testAutherDefinition,
    Authenticator,
    TestMongo,
    overrideEnvironment,
    restoreEnvironment,
    globalTeardown,
    globalSetup,
};
