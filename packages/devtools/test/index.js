const {testDefinitionRequiredAuthMethods} = require('./auther-definition-method-tester');
const {createMockIntegration, createMockApiObject} = require('./mock-integration');
const { testAutherDefinition } = require('./auther-definition-tester');


module.exports = {
    createMockIntegration,
    createMockApiObject,
    testDefinitionRequiredAuthMethods,
    testAutherDefinition,
};
