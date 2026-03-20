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
async function bootstrap(prisma, appDefinition) {
    if (!appDefinition?.integrations || !Array.isArray(appDefinition.integrations)) {
        return;
    }

    for (const integration of appDefinition.integrations) {
        const modules = integration.Definition?.modules;
        if (!modules || typeof modules !== 'object') {
            continue;
        }

        for (const moduleDefinition of Object.values(modules)) {
            if (!moduleDefinition?.moduleName) {
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

                    if (record) {
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
        }
    }
}

module.exports = bootstrap;
