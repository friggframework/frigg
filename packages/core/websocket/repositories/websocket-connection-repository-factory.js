const {
    WebsocketConnectionRepository,
} = require('./websocket-connection-repository');

/**
 * Websocket Connection Repository Factory
 * Creates the appropriate repository adapter based on database type
 *
 * Note: Currently, WebsocketConnection model has identical structure across MongoDB and PostgreSQL,
 * so this factory always returns WebsocketConnectionRepository. This pattern is maintained for:
 * - Consistency with other repository factories
 * - Future-proofing if database-specific implementations become needed
 * - Unified API for repository instantiation across the codebase
 *
 * Usage:
 * ```javascript
 * const repository = createWebsocketConnectionRepository();
 * await repository.createConnection(connectionId);
 * ```
 *
 * @param {Object} [prismaClient] - Optional Prisma client for testing
 * @returns {WebsocketConnectionRepositoryInterface} Configured repository adapter
 */
function createWebsocketConnectionRepository(prismaClient) {
    const dbType = process.env.DB_TYPE || 'mongodb';

    // Currently, WebsocketConnectionRepository works identically for both databases
    // If database-specific logic is needed in the future, add cases here:
    switch (dbType) {
        case 'mongodb':
            return new WebsocketConnectionRepository(prismaClient);

        case 'postgresql':
            return new WebsocketConnectionRepository(prismaClient);

        default:
            throw new Error(
                `Unsupported DB_TYPE: ${dbType}. Supported values: 'mongodb', 'postgresql'`
            );
    }
}

module.exports = {
    createWebsocketConnectionRepository,
    // Export adapter for direct testing
    WebsocketConnectionRepository,
};
