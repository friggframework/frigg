/**
 * Per-function environment scoping (ADR-027)
 *
 * Builders emit `result.functionEnvironments` — a map of function name to
 * env vars — instead of broadcasting framework vars app-wide through
 * `result.environment`. The composer applies the merged map onto the final
 * function definitions after every function (base + builder) exists.
 */

/**
 * Whether builders should scope framework env vars per function. Skipped in
 * local mode: the serverless-plugin injects LocalStack queue URLs at
 * provider level only, and function-level values would shadow them.
 *
 * @param {Object} appDefinition
 * @returns {boolean}
 */
function isScopedEnvironmentActive(appDefinition = {}) {
    if (process.env.FRIGG_SKIP_AWS_DISCOVERY === 'true') return false;
    return appDefinition.lambda?.scopedEnvironment === true;
}

/**
 * Apply a merged functionEnvironments map onto the composed functions.
 * A key a builder already set directly on a function wins (e.g. the
 * admin-script router's own SCHEDULER_ROLE_ARN must not be clobbered by
 * the integration-scheduler value). An unknown function name is a hard
 * error — silently dropping a var would surface as a runtime failure.
 *
 * @param {Object} functions - definition.functions (mutated)
 * @param {Object} functionEnvironments - { fnName: { KEY: value } }
 */
function applyFunctionEnvironments(functions, functionEnvironments = {}) {
    for (const [fnName, env] of Object.entries(functionEnvironments)) {
        const fn = functions[fnName];
        if (!fn) {
            throw new Error(
                `functionEnvironments targets unknown function '${fnName}' (known: ${Object.keys(
                    functions
                ).join(', ')})`
            );
        }
        fn.environment = { ...env, ...(fn.environment || {}) };
    }
}

/**
 * Function names the integration builder creates for one integration.
 * Wire contract: must stay in sync with
 * IntegrationBuilder.createFunctionDefinitions — a drift here surfaces as a
 * hard unknown-function error at compose time, not a silent var drop.
 *
 * @param {Object} integration - entry from appDefinition.integrations
 * @returns {string[]}
 */
function getIntegrationFunctionNames(integration) {
    const name = integration.Definition.name;
    const names = [name, `${name}QueueWorker`];

    const webhooks = integration.Definition.webhooks;
    if (webhooks === true || webhooks?.enabled === true) {
        names.splice(1, 0, `${name}Webhook`);
    }

    for (const [bindingKey, binding] of Object.entries(
        integration.Definition.extensions || {}
    )) {
        const routes = binding?.extension?.routes || [];
        if (routes.length === 0) continue;
        names.push(`${name}__${String(bindingKey).replace(/[^A-Za-z0-9]/g, '')}`);
    }

    return names;
}

/**
 * Admin-script functions, when the feature is on (mirrors
 * AdminScriptBuilder.shouldExecute). Both can instantiate arbitrary
 * integrations, so they belong in every integration's queue-URL consumer
 * set.
 *
 * @param {Object} appDefinition
 * @returns {string[]}
 */
function getAdminFunctionNames(appDefinition = {}) {
    return Array.isArray(appDefinition.adminScripts) &&
        appDefinition.adminScripts.length > 0
        ? ['adminScriptRouter', 'adminScriptExecutor']
        : [];
}

module.exports = {
    isScopedEnvironmentActive,
    applyFunctionEnvironments,
    getIntegrationFunctionNames,
    getAdminFunctionNames,
};
