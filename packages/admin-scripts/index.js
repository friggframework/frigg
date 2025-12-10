/**
 * @friggframework/admin-scripts
 *
 * Admin Script Runner for Frigg - Execute maintenance and operational scripts
 * in hosted environments with VPC/KMS secured database connections.
 */

// Domain Models
const { AdminApiKey } = require('./src/domain/admin-api-key');
const { ScriptExecution } = require('./src/domain/script-execution');
const { ScheduleSpec } = require('./src/domain/schedule-spec');

// Application Services
const { ScriptFactory } = require('./src/application/script-factory');
const { ScriptContext } = require('./src/application/script-context');
const { FriggCommands } = require('./src/application/frigg-commands');
const { ScriptRunner } = require('./src/application/script-runner');

// Infrastructure
const { createAdminScriptRouter } = require('./src/infrastructure/admin-script-router');
const { createScriptHandler } = require('./src/infrastructure/create-script-handler');
const { ScriptQueueWorker } = require('./src/infrastructure/script-queue-worker');
const { requireAdminApiKey } = require('./src/infrastructure/admin-auth-middleware');

// Built-in Scripts
const builtinScripts = require('./src/builtins');

// Factory function for creating the admin backend
function createAdminBackend(params) {
    const {
        scripts = [],
        integrationFactory,
        options = {}
    } = params;

    // Merge user scripts with builtins if enabled
    const allScripts = options.includeBuiltins !== false
        ? [...builtinScripts, ...scripts]
        : scripts;

    const scriptFactory = new ScriptFactory(allScripts);

    return {
        scriptFactory,
        integrationFactory,
        createRouter: (routerOptions = {}) => createAdminScriptRouter({
            scriptFactory,
            integrationFactory,
            ...routerOptions
        }),
        createHandler: (handlerOptions = {}) => createScriptHandler({
            scriptFactory,
            integrationFactory,
            ...handlerOptions
        }),
        createWorker: () => new ScriptQueueWorker(scriptFactory, integrationFactory)
    };
}

module.exports = {
    // Main factory
    createAdminBackend,

    // Domain
    AdminApiKey,
    ScriptExecution,
    ScheduleSpec,

    // Application
    ScriptFactory,
    ScriptContext,
    FriggCommands,
    ScriptRunner,

    // Infrastructure
    createAdminScriptRouter,
    createScriptHandler,
    ScriptQueueWorker,
    requireAdminApiKey,

    // Built-ins
    builtinScripts
};
