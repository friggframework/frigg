const { ScriptFactory } = require('../application/script-factory');

/**
 * Admin Operations Bootstrap
 *
 * Composition root for the admin-scripts runtime. Loads the host app's
 * definition at Lambda runtime and builds two name-keyed registries — one for
 * admin scripts, one for reports — plus the command bundles they need, so the
 * routers and SQS workers can resolve operations by name. The registry class is
 * shared (ScriptFactory is generic over `static Definition.name`); reports are a
 * second instance rather than a duplicate class.
 *
 * Runs once per process (memoized) and never throws — a missing/unloadable app
 * definition is logged and leaves the registries empty rather than crashing the
 * Lambda cold start.
 */
let bootstrapped = false;
let scriptFactory = null;
let scriptCommands = null;
let integrationFactory = null;
let reportFactory = null;
let reportCommands = null;
let reportFriggCommands = null;

function registerScripts(factory, scriptClasses) {
    for (const ScriptClass of scriptClasses || []) {
        const name = ScriptClass?.Definition?.name;
        // Guard against re-registration (register() throws on name collision)
        if (name && !factory.has(name)) {
            factory.register(ScriptClass);
        }
    }
}

// A report whose name collides with a registered script is skipped: scripts and
// reports share ScriptSchedule.scriptName (@unique), so names must not clash.
function registerReports(factory, scriptRegistry, reportClasses) {
    for (const ReportClass of reportClasses || []) {
        const name = ReportClass?.Definition?.name;
        if (!name) continue;
        if (scriptRegistry.has(name)) {
            console.error(
                `[admin-scripts] bootstrap: report "${name}" collides with a registered script name; skipping.`
            );
            continue;
        }
        if (!factory.has(name)) {
            factory.register(ReportClass);
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
 * Build the command bundle injected into every AdminScriptContext. Operations
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

function buildReportFriggCommands() {
    const {
        createIntegrationMappingCommands,
    } = require('@friggframework/core/application/commands/integration-mapping-commands');
    const {
        createUsageCommands,
    } = require('@friggframework/core/application/commands/usage-commands');

    return {
        ...buildScriptCommands(),
        integrationMappings: createIntegrationMappingCommands(),
        usage: createUsageCommands(),
    };
}

/**
 * @returns {{ scriptFactory: ScriptFactory, scriptCommands: object, integrationFactory: object, reportFactory: ScriptFactory, reportCommands: object, reportFriggCommands: object }}
 */
function bootstrapAdminScripts() {
    if (bootstrapped) {
        return {
            scriptFactory,
            scriptCommands,
            integrationFactory,
            reportFactory,
            reportCommands,
            reportFriggCommands,
        };
    }
    bootstrapped = true;

    // Create the registries up front so consumers always get (possibly empty)
    // factories even when the app definition can't be loaded — mirrors the
    // never-throw contract above.
    scriptFactory = new ScriptFactory();
    reportFactory = new ScriptFactory();

    try {
        const {
            loadAppDefinition,
        } = require('@friggframework/core/handlers/app-definition-loader');
        const {
            adminScripts = [],
            reports = [],
            admin = {},
        } = loadAppDefinition();

        registerScripts(scriptFactory, adminScripts);
        registerReports(reportFactory, scriptFactory, reports);

        if (admin.includeBuiltinReports) {
            const {
                BUILTIN_REPORTS,
            } = require('@friggframework/core/reporting/builtin-reports');
            registerReports(reportFactory, scriptFactory, BUILTIN_REPORTS);
        }
    } catch (error) {
        console.error(
            '[admin-scripts] bootstrap: could not load app definition:',
            error.message
        );
    }

    // Built in their own try so a command-layer failure never blocks operation
    // registration (and vice versa) — all honor the never-throw contract.
    try {
        scriptCommands = buildScriptCommands();
    } catch (error) {
        console.error(
            '[admin-scripts] bootstrap: could not build command bundle:',
            error.message
        );
    }

    try {
        reportFriggCommands = buildReportFriggCommands();
        const {
            createReportCommands,
        } = require('@friggframework/core/application/commands/report-commands');
        reportCommands = createReportCommands();
    } catch (error) {
        console.error(
            '[admin-scripts] bootstrap: could not build report commands:',
            error.message
        );
    }

    integrationFactory = createIntegrationFactory();
    return {
        scriptFactory,
        scriptCommands,
        integrationFactory,
        reportFactory,
        reportCommands,
        reportFriggCommands,
    };
}

/** Test-only: reset memoized bootstrap state. */
function _resetBootstrapForTests() {
    bootstrapped = false;
    scriptFactory = null;
    scriptCommands = null;
    integrationFactory = null;
    reportFactory = null;
    reportCommands = null;
    reportFriggCommands = null;
}

module.exports = {
    bootstrapAdminScripts,
    _resetBootstrapForTests,
};
