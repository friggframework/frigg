const { ScriptFactory } = require('../application/script-factory');

/**
 * Admin Script Bootstrap
 *
 * Composition root for the admin-scripts runtime. Loads the host app's
 * definition at Lambda runtime, builds a ScriptFactory, and registers the app's
 * admin scripts into it so the router and SQS worker can resolve scripts by
 * name. Also constructs the integrationFactory used by scripts that need
 * hydrated integration instances. Both are returned for the caller to inject.
 *
 * Runs once per process (memoized) and never throws — a missing/unloadable app
 * definition is logged and leaves the factory empty rather than crashing the
 * Lambda cold start.
 */
let bootstrapped = false;
let scriptFactory = null;
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
 * @returns {{ scriptFactory: ScriptFactory, integrationFactory: object }}
 */
function bootstrapAdminScripts() {
    if (bootstrapped) {
        return { scriptFactory, integrationFactory };
    }
    bootstrapped = true;

    // Create the registry up front so consumers always get a (possibly empty)
    // factory even when the app definition can't be loaded — mirrors the
    // never-throw contract above.
    scriptFactory = new ScriptFactory();

    try {
        const {
            loadAppDefinition,
        } = require('@friggframework/core/handlers/app-definition-loader');
        const { adminScripts = [] } = loadAppDefinition();

        registerScripts(scriptFactory, adminScripts);
    } catch (error) {
        console.error(
            '[admin-scripts] bootstrap: could not load app definition:',
            error.message
        );
    }

    integrationFactory = createIntegrationFactory();
    return { scriptFactory, integrationFactory };
}

/** Test-only: reset memoized bootstrap state. */
function _resetBootstrapForTests() {
    bootstrapped = false;
    scriptFactory = null;
    integrationFactory = null;
}

module.exports = {
    bootstrapAdminScripts,
    _resetBootstrapForTests,
};
