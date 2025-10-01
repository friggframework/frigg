const {
    WebsocketConnectionRepositoryMongo,
} = require('./websocket-connection-repository-mongo');
const {
    WebsocketConnectionRepositoryPostgres,
} = require('./websocket-connection-repository-postgres');

/**
 * Websocket Connection Repository Factory
 * Creates the appropriate repository adapter based on database type
 *
 * Database-specific implementations:
 * - MongoDB: Uses String IDs (ObjectId), no conversion needed
 * - PostgreSQL: Uses Int IDs, converts String ↔ Int
 *
 * All repository methods return String IDs regardless of database type,
 * ensuring application layer consistency.
 *
 * Usage:
 * ```javascript
 * const repository = createWebsocketConnectionRepository();
 * await repository.createConnection(connectionId);
 * const connection = await repository.findConnectionById(id); // ID is string
 * ```
 *
 * @param {Object} [prismaClient] - Optional Prisma client for testing
 * @returns {WebsocketConnectionRepositoryInterface} Configured repository adapter
 */
function createWebsocketConnectionRepository(prismaClient) {
    const dbType = process.env.DB_TYPE || 'mongodb';

    switch (dbType) {
        case 'mongodb':
            return new WebsocketConnectionRepositoryMongo(prismaClient);

        case 'postgresql':
            return new WebsocketConnectionRepositoryPostgres(prismaClient);

        default:
            throw new Error(
                `Unsupported DB_TYPE: ${dbType}. Supported values: 'mongodb', 'postgresql'`
            );
    }
}

module.exports = {
    createWebsocketConnectionRepository,
    // Export adapters for direct testing
    WebsocketConnectionRepositoryMongo,
    WebsocketConnectionRepositoryPostgres,
};
