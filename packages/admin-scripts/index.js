/**
 * @friggframework/admin-scripts
 *
 * Admin Script Runner for Frigg - Execute maintenance and operational scripts
 * in hosted environments with VPC/KMS secured database connections.
 */

// Application Services
const {
    ScriptFactory,
    getScriptFactory,
} = require('./src/application/script-factory');
const { AdminScriptBase } = require('./src/application/admin-script-base');
const {
    AdminScriptContext,
    createAdminScriptContext,
} = require('./src/application/admin-frigg-commands');
const {
    ScriptRunner,
    createScriptRunner,
} = require('./src/application/script-runner');

// Infrastructure
const {
    validateAdminApiKey,
} = require('./src/infrastructure/admin-auth-middleware');
const {
    router,
    app,
    handler: routerHandler,
} = require('./src/infrastructure/admin-script-router');
const {
    handler: executorHandler,
} = require('./src/infrastructure/script-executor-handler');

// Adapters
const { SchedulerAdapter } = require('./src/adapters/scheduler-adapter');
const { AWSSchedulerAdapter } = require('./src/adapters/aws-scheduler-adapter');
const {
    LocalSchedulerAdapter,
} = require('./src/adapters/local-scheduler-adapter');
const {
    createSchedulerAdapter,
} = require('./src/adapters/scheduler-adapter-factory');

module.exports = {
    // Application layer
    AdminScriptBase,
    ScriptFactory,
    getScriptFactory,
    AdminScriptContext,
    createAdminScriptContext,
    ScriptRunner,
    createScriptRunner,

    // Infrastructure layer
    validateAdminApiKey,
    router,
    app,
    routerHandler,
    executorHandler,

    // Adapters
    SchedulerAdapter,
    AWSSchedulerAdapter,
    LocalSchedulerAdapter,
    createSchedulerAdapter,
};
