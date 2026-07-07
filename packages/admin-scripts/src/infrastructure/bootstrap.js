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
let scriptCommands = null;
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
 * Build the command bundle injected into every AdminScriptContext. Scripts
 * interact with the database only through these Frigg commands — never through
 * repositories directly. The require is lazy so the package keeps no load-time
 * coupling to core's command/repository modules.
 */
function buildScriptCommands() {
    const {
        createUserCommands,
    } = require('@friggframework/core/application/commands/user-commands');
    const {
        createCredentialCommands,
    } = require('@friggframework/core/application/commands/credential-commands');
    const {
        createEntityCommands,
    } = require('@friggframework/core/application/commands/entity-commands');
    const {
        createIntegrationCommands,
    } = require('@friggframework/core/application/commands/integration-commands');

    return {
        users: createUserCommands(),
        credentials: createCredentialCommands(),
        entities: createEntityCommands(),
        // Class-agnostic reads (findIntegrationById, listIntegrations). Scripts
        // that need class-scoped integration ops build their own commands.
        integrations: createIntegrationCommands(),
    };
}

/**
 * @returns {{ scriptFactory: ScriptFactory, scriptCommands: object, integrationFactory: object }}
 */
function bootstrapAdminScripts() {
    if (bootstrapped) {
        return { scriptFactory, scriptCommands, integrationFactory };
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

    // Built in its own try so a command-layer failure never blocks script
    // registration (and vice versa) — both honor the never-throw contract.
    try {
        scriptCommands = buildScriptCommands();
    } catch (error) {
        console.error(
            '[admin-scripts] bootstrap: could not build command bundle:',
            error.message
        );
    }

    integrationFactory = createIntegrationFactory();
    return { scriptFactory, scriptCommands, integrationFactory };
}

/** Test-only: reset memoized bootstrap state. */
function _resetBootstrapForTests() {
    bootstrapped = false;
    scriptFactory = null;
    scriptCommands = null;
    integrationFactory = null;
}

module.exports = {
    bootstrapAdminScripts,
    _resetBootstrapForTests,
};
