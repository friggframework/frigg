/**
 * @friggframework/admin-scripts
 *
 * Admin Script Runner for Frigg - Execute maintenance and operational scripts
 * in hosted environments with VPC/KMS secured database connections.
 */

// Domain Models (TODO: implement these)
// const { AdminApiKey } = require('./src/domain/admin-api-key');
// const { ScriptExecution } = require('./src/domain/script-execution');
// const { ScheduleSpec } = require('./src/domain/schedule-spec');

// Application Services
const { ScriptFactory, getScriptFactory, createScriptFactory } = require('./src/application/script-factory');
const { AdminScriptBase } = require('./src/application/admin-script-base');
const { AdminFriggCommands, createAdminFriggCommands } = require('./src/application/admin-frigg-commands');
const { ScriptRunner, createScriptRunner } = require('./src/application/script-runner');

// Infrastructure
const { adminAuthMiddleware } = require('./src/infrastructure/admin-auth-middleware');
const { router, app, handler: routerHandler } = require('./src/infrastructure/admin-script-router');
const { handler: executorHandler } = require('./src/infrastructure/script-executor-handler');

// Built-in Scripts
const {
    OAuthTokenRefreshScript,
    IntegrationHealthCheckScript,
    builtinScripts,
    registerBuiltinScripts,
} = require('./src/builtins');

// Factory function for creating the admin backend (TODO: implement when infrastructure is ready)
// function createAdminBackend(params) {
//     const {
//         scripts = [],
//         integrationFactory,
//         options = {}
//     } = params;
//
//     // Merge user scripts with builtins if enabled
//     const allScripts = options.includeBuiltins !== false
//         ? [...builtinScripts, ...scripts]
//         : scripts;
//
//     const scriptFactory = new ScriptFactory(allScripts);
//
//     return {
//         scriptFactory,
//         integrationFactory,
//         createRouter: (routerOptions = {}) => createAdminScriptRouter({
//             scriptFactory,
//             integrationFactory,
//             ...routerOptions
//         }),
//         createHandler: (handlerOptions = {}) => createScriptHandler({
//             scriptFactory,
//             integrationFactory,
//             ...handlerOptions
//         }),
//         createWorker: () => new ScriptQueueWorker(scriptFactory, integrationFactory)
//     };
// }

module.exports = {
    // Application layer
    AdminScriptBase,
    ScriptFactory,
    getScriptFactory,
    createScriptFactory,
    AdminFriggCommands,
    createAdminFriggCommands,
    ScriptRunner,
    createScriptRunner,

    // Infrastructure layer
    adminAuthMiddleware,
    router,
    app,
    routerHandler,
    executorHandler,

    // Built-in scripts
    OAuthTokenRefreshScript,
    IntegrationHealthCheckScript,
    builtinScripts,
    registerBuiltinScripts,
};
