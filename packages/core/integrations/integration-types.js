/**
 * Integration types: how an installation's `config.type` becomes the class that runs it.
 *
 * Most types are classes the app registers at startup (appDefinition.integrations). A registered class may also be
 * a provider: `static IntegrationProvider = { resolve(type), list() }` answers for types that exist as data rather
 * than code (published integration definitions). Those resolve to classes of their own, with their own name, so a
 * caller cannot tell how an integration was made; only the deployment underneath (queue, functions) is shared.
 *
 * Registered classes win over provided ones, so a published definition can never shadow code.
 */

/** The class for a type, or null. */
async function resolveIntegrationClass(integrationClasses, type) {
    if (!type) return null;
    const registered = integrationClasses.find((c) => c?.Definition?.name === type);
    if (registered) return registered;
    for (const c of integrationClasses) {
        if (!c?.IntegrationProvider) continue;
        const provided = await c.IntegrationProvider.resolve(type);
        if (provided) return provided;
    }
    return null;
}

/**
 * Every type a user can install: the registered classes, except providers (which are hosts, not integrations),
 * plus every type each provider offers.
 */
async function listIntegrationClasses(integrationClasses) {
    const registered = new Set(integrationClasses.map((c) => c?.Definition?.name));
    const out = [];
    for (const c of integrationClasses) {
        if (!c?.IntegrationProvider) { out.push(c); continue; }
        for (const provided of await c.IntegrationProvider.list()) {
            if (!registered.has(provided.Definition.name)) out.push(provided);
        }
    }
    return out;
}

module.exports = { resolveIntegrationClass, listIntegrationClasses };
