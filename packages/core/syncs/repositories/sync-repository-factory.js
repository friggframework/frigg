const { SyncRepositoryMongo } = require('./sync-repository-mongo');
const { SyncRepositoryPostgres } = require('./sync-repository-postgres');

/**
 * Sync Repository Factory
 * Creates the appropriate repository adapter based on database type
 *
 * This implements the Factory pattern for Hexagonal Architecture:
 * - Reads DB_TYPE environment variable
 * - Returns correct adapter (MongoDB or PostgreSQL)
 * - Provides clear error for unsupported databases
 * - Allows optional Prisma client injection for testing
 *
 * Usage:
 * ```javascript
 * const repository = createSyncRepository();
 * const sync = await repository.getSyncObject(name, dataId, entityId);
 * ```
 *
 * @param {Object} [prismaClient] - Optional Prisma client for testing
 * @returns {SyncRepositoryInterface} Configured repository adapter
 * @throws {Error} If DB_TYPE is not supported
 */
function createSyncRepository(prismaClient) {
    const dbType = process.env.DB_TYPE || 'mongodb';

    switch (dbType) {
        case 'mongodb':
            return new SyncRepositoryMongo(prismaClient);

        case 'postgresql':
            return new SyncRepositoryPostgres(prismaClient);

        default:
            throw new Error(
                `Unsupported DB_TYPE: ${dbType}. Supported values: 'mongodb', 'postgresql'`
            );
    }
}

module.exports = {
    createSyncRepository,
    // Export adapters for direct testing
    SyncRepositoryMongo,
    SyncRepositoryPostgres,
};
