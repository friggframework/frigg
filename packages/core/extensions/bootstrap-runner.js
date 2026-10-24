/**
 * Bootstrap Runner
 *
 * Runs extension bootstrap functions in sequence.
 * Bootstrap hooks execute AFTER database connection but BEFORE integration
 * router creation. This is the right place for extensions to:
 *
 * - Load credentials from database into integration definitions
 * - Register additional middleware or services
 * - Perform one-time initialization
 *
 * @example
 * await runExtensionBootstraps(extensions, { prisma, appDefinition });
 */

/**
 * Runs all extension bootstrap functions in sequence.
 *
 * @param {Array<Object>} extensions - Normalized extensions (from extension-loader)
 * @param {Object} context
 * @param {Object} context.prisma - Prisma client instance
 * @param {Object} context.appDefinition - Full app definition
 * @throws {Error} If any bootstrap function fails (fails fast)
 */
async function runExtensionBootstraps(extensions, context = {}) {
    if (!extensions || extensions.length === 0) return;

    const { prisma, appDefinition } = context;

    for (const ext of extensions) {
        if (!ext.bootstrap) continue;

        try {
            await ext.bootstrap(prisma, appDefinition);
        } catch (error) {
            throw new Error(
                `Extension "${ext.name}" bootstrap failed: ${error.message}`
            );
        }
    }
}

module.exports = { runExtensionBootstraps };
