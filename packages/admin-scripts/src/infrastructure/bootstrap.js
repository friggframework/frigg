const { getScriptFactory } = require('../application/script-factory');

/**
 * Admin Script Bootstrap
 *
 * Loads the host app's definition at Lambda runtime and registers its admin
 * scripts (and the built-ins, when enabled) into the global ScriptFactory, so
 * the router and SQS worker can resolve scripts by name. Also constructs the
 * integrationFactory used by scripts that need hydrated integration instances.
 *
 * Runs once per process (memoized) and never throws — a missing/unloadable app
 * definition is logged and leaves the factory empty rather than crashing the
 * Lambda cold start.
 */
let bootstrapped = false;
let integrationFactory = null;

function registerScripts(factory, scriptClasses) {
    for (const ScriptClass of scriptClasses || []) {
        const name = ScriptClass?.Definition?.name;
        // Guard against re-registration (register() throws on name collision)
        if (name && !factory.has(name)) {
            factory.register(ScriptClass);
        }
    }
}

/**
 * Build an integration factory backed by the framework's runtime hydration.
 * Scripts call `context.instantiate(integrationId)` which delegates here.
 * The require is lazy so the admin-scripts package has no load-time coupling
 * to core's backend utilities (and unit tests never hit this path).
 */
function createIntegrationFactory() {
    return {
        async getInstanceFromIntegrationId({ integrationId }) {
            const {
                loadIntegrationForWebhook,
            } = require('@friggframework/core/handlers/backend-utils');
            return loadIntegrationForWebhook(integrationId);
        },
    };
}

/**
 * @returns {{ integrationFactory: object }}
 */
function bootstrapAdminScripts() {
    if (bootstrapped) {
        return { integrationFactory };
    }
    bootstrapped = true;

    try {
        const {
            loadAppDefinition,
        } = require('@friggframework/core/handlers/app-definition-loader');
        const { adminScripts = [], admin = {} } = loadAppDefinition();

        const factory = getScriptFactory();
        registerScripts(factory, adminScripts);

        if (admin.includeBuiltinScripts) {
            const { builtinScripts } = require('../builtins');
            registerScripts(factory, builtinScripts);
        }
    } catch (error) {
        console.error(
            '[admin-scripts] bootstrap: could not load app definition:',
            error.message
        );
    }

    integrationFactory = createIntegrationFactory();
    return { integrationFactory };
}

/** Test-only: reset memoized bootstrap state. */
function _resetBootstrapForTests() {
    bootstrapped = false;
    integrationFactory = null;
}

module.exports = {
    bootstrapAdminScripts,
    _resetBootstrapForTests,
};
