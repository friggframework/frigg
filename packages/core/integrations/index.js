const { IntegrationBase } = require('./integration-base');
const { Options } = require('./options');
const {
    createIntegrationRouter,
    checkRequiredParams,
} = require('./integration-router');
const {
    getModulesDefinitionFromIntegrationClasses,
} = require('./utils/map-integration-dto');
const {
    LoadIntegrationContextUseCase,
} = require('./use-cases/load-integration-context');
const {
    validateExtensionBinding,
    getExtensionRoutes,
    getExtensionWorkers,
} = require('./extension');

module.exports = {
    IntegrationBase,
    Options,
    createIntegrationRouter,
    checkRequiredParams,
    // Deprecated (ADR-059): a wrapper over getEntityTypeRegistry.
    getModulesDefinitionFromIntegrationClasses,
    LoadIntegrationContextUseCase,
    validateExtensionBinding,
    getExtensionRoutes,
    getExtensionWorkers,
};
