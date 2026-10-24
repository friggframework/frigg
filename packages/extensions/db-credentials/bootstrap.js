/**
 * Bootstrap hook for the db-credentials extension.
 *
 * Runs after database connection but before routers are created.
 * Replaces static `definition.env` on each integration's module definitions
 * with an async function that loads OAuth app credentials from the database.
 *
 * This allows client_id/client_secret to be managed in the DB (via the admin API)
 * instead of hardcoding them as environment variables.
 *
 * @param {Object} prisma - Prisma client instance
 * @param {Object} appDefinition - Full Frigg app definition
 */
const DB_CREDENTIALS_ENV = Symbol.for('frigg.extension.db-credentials.env');

/**
 * Every module definition the app can authorize: those bound by integrations
 * (`integrations[].Definition.modules`) and those registered as entity types
 * (`entities.<key>.definition`, ADR-059), which an app may declare with no
 * integration at all. One definition can appear in both.
 */
function collectModuleDefinitions(appDefinition) {
    const definitions = [];
    for (const integration of appDefinition?.integrations || []) {
        const modules = integration?.Definition?.modules;
        if (!modules || typeof modules !== 'object') continue;
        for (const entry of Object.values(modules)) {
            // Definition.modules entries are `{ definition }` (the shape
            // IntegrationBase and the entity-type registry read); a bare
            // module definition is accepted too.
            definitions.push(entry?.definition ?? entry);
        }
    }
    const entities = appDefinition?.entities;
    if (entities && typeof entities === 'object') {
        // Non-object values (the registry's `infer` flag) are not entity types.
        for (const entry of Object.values(entities)) {
            if (entry && typeof entry === 'object') definitions.push(entry.definition);
        }
    }
    return definitions.filter((definition) => definition?.moduleName);
}

async function bootstrap(prisma, appDefinition) {
    for (const moduleDefinition of collectModuleDefinitions(appDefinition)) {
        // Two integrations (or an integration and the entity registry) can
        // share one module definition, and a forced re-initialization runs
        // the bootstrap again: wrap once.
        if (moduleDefinition.env?.[DB_CREDENTIALS_ENV]) {
            continue;
        }

        const { moduleName } = moduleDefinition;
        const originalEnv = moduleDefinition.env;

        // Replace env with an async loader that queries the DB first,
        // falling back to the original static env if no DB record exists.
        moduleDefinition.env = async () => {
            try {
                const record = await prisma.oAuthAppCredential.findUnique({
                    where: { moduleName },
                });

                // A deactivated credential (the admin DELETE without
                // ?hard=true) must stop authenticating: fall back to env.
                if (record && record.isActive !== false) {
                    const base = typeof originalEnv === 'function'
                        ? await originalEnv()
                        : (originalEnv || {});

                    return {
                        ...base,
                        client_id: record.clientId,
                        client_secret: record.clientSecret,
                        ...(record.extra && typeof record.extra === 'object' ? record.extra : {}),
                    };
                }
            } catch (error) {
                // Table may not exist yet (e.g. first deploy before migration).
                // Fall through to original env.
            }

            // Fallback to original env
            if (typeof originalEnv === 'function') {
                return await originalEnv();
            }
            return originalEnv;
        };
        moduleDefinition.env[DB_CREDENTIALS_ENV] = true;
    }
}

module.exports = bootstrap;
module.exports.collectModuleDefinitions = collectModuleDefinitions;
