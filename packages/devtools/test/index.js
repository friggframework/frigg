const { testDefinitionRequiredAuthMethods } = require('./auther-definition-method-tester');
const { createMockIntegration, createMockApiObject } = require('./mock-integration');


module.exports = {
    createMockIntegration,
    createMockApiObject,
    testDefinitionRequiredAuthMethods,
};
