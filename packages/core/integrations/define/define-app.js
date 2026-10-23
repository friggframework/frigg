/**
 * `defineApp` (ADR-054 §1): the app definition, as `backend/index.js` exports it today (`{ Definition }`).
 *
 *     module.exports = defineApp({ name, integrations: [DealAlerts], database: { postgres: { enable: true } } });
 *
 * It checks what can be checked when the file loads: every integration is an IntegrationBase subclass with a
 * `Definition.name`, names are unique, and the app definition passes ADR-051's `app-definition.schema.json`
 * (through `@friggframework/schemas`, when the app has it installed; the schema treats each integration as an
 * object, so the classes are checked here and summarised for it).
 *
 * It also appends the admin scripts the bound modules export (`module.scripts`, e.g. HubSpot's
 * `hubspot.reconcile-subscriptions`) to `adminScripts`, once each by name; a script the app lists itself wins.
 */
const { IntegrationBase } = require('../integration-base');
const { planOf } = require('./define-integration');

function loadSchemas() {
    try {
        // eslint-disable-next-line global-require
        return require('@friggframework/schemas');
    } catch (error) {
        if (error?.code === 'MODULE_NOT_FOUND') return null;
        throw error;
    }
}

function defineApp(appDefinition = {}, { schemas = loadSchemas() } = {}) {
    const where = `defineApp(${appDefinition?.name ? `"${appDefinition.name}"` : ''})`;
    if (!appDefinition || typeof appDefinition !== 'object') throw new Error(`${where}: expects the app definition object`);
    const integrations = appDefinition.integrations;
    if (!Array.isArray(integrations) || !integrations.length) throw new Error(`${where}: "integrations" must list at least one integration`);
    const names = new Set();
    for (const [i, Cls] of integrations.entries()) {
        if (typeof Cls !== 'function' || !(Cls.prototype instanceof IntegrationBase)) {
            throw new Error(`${where}: integrations[${i}] is not an integration class (defineIntegration or an IntegrationBase subclass)`);
        }
        const name = Cls.Definition?.name;
        if (!name) throw new Error(`${where}: integrations[${i}] has no Definition.name`);
        if (names.has(name)) throw new Error(`${where}: two integrations are named "${name}"`);
        names.add(name);
    }
    if (schemas?.validateAppDefinition) {
        const summary = { ...appDefinition, integrations: integrations.map((Cls) => ({ name: Cls.Definition.name })) };
        const result = schemas.validateAppDefinition(summary);
        if (result && result.valid === false) {
            const errors = (result.errors || []).map((e) => (typeof e === 'string' ? e : `${e.instancePath || e.path || ''} ${e.message || ''}`.trim()));
            throw new Error(`${where}: the app definition does not match app-definition.schema.json: ${errors.join('; ')}`);
        }
    }
    const adminScripts = [...(appDefinition.adminScripts || [])];
    const named = new Set(adminScripts.map((S) => S?.Definition?.name));
    for (const Cls of integrations) {
        for (const binding of planOf(Cls)?.bindings || []) {
            const scripts = binding.module.scripts;
            for (const Script of Array.isArray(scripts) ? scripts : Object.values(scripts || {})) {
                const scriptName = Script?.Definition?.name;
                if (!scriptName || named.has(scriptName)) continue;
                named.add(scriptName);
                adminScripts.push(Script);
            }
        }
    }
    return { Definition: { ...appDefinition, integrations: [...integrations], ...(adminScripts.length ? { adminScripts } : {}) } };
}

module.exports = { defineApp };
