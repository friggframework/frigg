/**
 * @friggframework/admin-scripts
 *
 * Admin Script Runner for Frigg - Execute maintenance and operational scripts
 * in hosted environments with VPC/KMS secured database connections.
 */

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

// Adapters
const { SchedulerAdapter } = require('./src/adapters/scheduler-adapter');
const { AWSSchedulerAdapter } = require('./src/adapters/aws-scheduler-adapter');
const { LocalSchedulerAdapter } = require('./src/adapters/local-scheduler-adapter');
const {
    createSchedulerAdapter,
    detectSchedulerAdapterType,
} = require('./src/adapters/scheduler-adapter-factory');

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

    // Adapters
    SchedulerAdapter,
    AWSSchedulerAdapter,
    LocalSchedulerAdapter,
    createSchedulerAdapter,
    detectSchedulerAdapterType,
};
