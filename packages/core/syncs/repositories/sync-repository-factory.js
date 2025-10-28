const { SyncRepositoryMongo } = require('./sync-repository-mongo');
const { SyncRepositoryPostgres } = require('./sync-repository-postgres');
const config = require('../../database/config');

/**
 * Sync Repository Factory
 * Creates the appropriate repository adapter based on database type
 *
 * Usage:
 * ```javascript
 * const repository = createSyncRepository();
 * ```
 *
 * @returns {SyncRepositoryInterface} Configured repository adapter
 */
function createSyncRepository() {
    const dbType = config.DB_TYPE;

    switch (dbType) {
        case 'mongodb':
            return new SyncRepositoryMongo();

        case 'postgresql':
            return new SyncRepositoryPostgres();

        default:
            throw new Error(
                `Unsupported database type: ${dbType}. Supported values: 'mongodb', 'postgresql'`
            );
    }
}

module.exports = {
    createSyncRepository,
    // Export adapters for direct testing
    SyncRepositoryMongo,
    SyncRepositoryPostgres,
};
