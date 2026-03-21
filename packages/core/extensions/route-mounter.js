/**
 * Route Mounter
 *
 * Mounts extension-defined Express routers onto the main app.
 * Each extension can declare routes with a base path and a handler factory.
 *
 * The handler factory receives (prisma, appDefinition) and returns an Express Router.
 * Routes are protected by the admin auth middleware by default.
 *
 * @example
 * mountExtensionRoutes(app, extensions, { prisma, appDefinition });
 */

const { validateAdminApiKey } = require('../handlers/middleware/admin-auth');

/**
 * Mounts all extension routes onto an Express app.
 *
 * @param {import('express').Express} app - Express app or router to mount on
 * @param {Array<Object>} extensions - Normalized extensions (from extension-loader)
 * @param {Object} context
 * @param {Object} context.prisma - Prisma client instance
 * @param {Object} context.appDefinition - Full app definition
 * @param {Function} [context.authMiddleware] - Override admin auth middleware
 */
function mountExtensionRoutes(app, extensions, context = {}) {
    if (!extensions || extensions.length === 0) return;

    const { prisma, appDefinition, authMiddleware } = context;
    const adminAuth = authMiddleware || validateAdminApiKey;

    for (const ext of extensions) {
        if (!ext.routes) continue;

        const { path: basePath, handler } = ext.routes;

        let router;
        if (typeof handler === 'function') {
            // Handler factory: (prisma, appDefinition) => Router
            router = handler(prisma, appDefinition);
        } else if (handler && handler.router) {
            // Direct router object export pattern: { router }
            router = handler.router;
        } else if (handler && handler.default && typeof handler.default === 'function') {
            // ES module default export
            router = handler.default(prisma, appDefinition);
        } else {
            console.warn(
                `Extension "${ext.name}": routes.handler is not a function or router object, skipping`
            );
            continue;
        }

        // Mount with admin auth middleware
        app.use(basePath, adminAuth, router);
    }
}

module.exports = { mountExtensionRoutes };
