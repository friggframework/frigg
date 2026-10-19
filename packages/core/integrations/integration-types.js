/**
 * Integration types: how an installation's `config.type` becomes the class that runs it.
 *
 * Most types are classes the app registers at startup (appDefinition.integrations). A registered class may also be
 * a provider: `static IntegrationProvider = { resolve(type), list() }` answers for types that exist as data rather
 * than code (published integration definitions). Those resolve to classes of their own, with their own name, so a
 * caller cannot tell how an integration was made; only the deployment underneath (queue, functions) is shared.
 *
 * Registered classes win over provided ones, so a published definition can never shadow code. When one would have,
 * that is logged (once per name per process) as `frigg.integrations.definition.shadowed_by_code`: the definition is
 * dead weight and whoever published it expects it to be installable.
 */
const { getLogger } = require('../logs');

const warnedShadowed = new Set();

/** A definition is ignored because registered code has the same name. Logging must never break a listing. */
function warnShadowed(name, provider) {
    if (warnedShadowed.has(name)) return;
    warnedShadowed.add(name);
    try {
        getLogger('frigg.integrations').warn('A published integration definition is ignored because registered code has the same name', {
            eventName: 'frigg.integrations.definition.shadowed_by_code',
            integrationName: name,
            provider: provider?.name || null,
        });
    } catch { /* ignore */ }
}

/**
 * The class for a type, or null.
 * @param {object} [context] who is asking. With `workspaceId`, a type built in another workspace does not resolve:
 *        what a user may install or see. Without it (hydrating an installation that exists) every type resolves.
 */
async function resolveIntegrationClass(integrationClasses, type, context) {
    if (!type) return null;
    const registered = integrationClasses.find((c) => c?.Definition?.name === type);
    if (registered) return registered;
    for (const c of integrationClasses) {
        if (!c?.IntegrationProvider) continue;
        const provided = await c.IntegrationProvider.resolve(type, context);
        if (provided) return provided;
    }
    return null;
}

/**
 * Every type a user can install: the registered classes, except providers (which are hosts, not integrations),
 * plus every type each provider offers.
 */
async function listIntegrationClasses(integrationClasses, context) {
    const registered = new Set(integrationClasses.map((c) => c?.Definition?.name));
    const out = [];
    for (const c of integrationClasses) {
        if (!c?.IntegrationProvider) { out.push(c); continue; }
        for (const provided of await c.IntegrationProvider.list(context)) {
            if (registered.has(provided.Definition.name)) warnShadowed(provided.Definition.name, c);
            else out.push(provided);
        }
    }
    return out;
}

module.exports = { resolveIntegrationClass, listIntegrationClasses, _resetShadowWarningsForTests: () => warnedShadowed.clear() };
