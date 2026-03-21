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
            const { SyncRepositoryMongo } = require('./sync-repository-mongo');
            return new SyncRepositoryMongo();

        case 'postgresql':
            return new SyncRepositoryPostgres();

        case 'documentdb':
            const { SyncRepositoryDocumentDB } = require('./sync-repository-documentdb');
            return new SyncRepositoryDocumentDB();

        default:
            throw new Error(
                `Unsupported database type: ${dbType}. Supported values: 'mongodb', 'documentdb', 'postgresql'`
            );
    }
}

module.exports = {
    createSyncRepository,
    // Export adapters for direct testing
    get SyncRepositoryMongo() { return require('./sync-repository-mongo').SyncRepositoryMongo; },
    SyncRepositoryPostgres,
    get SyncRepositoryDocumentDB() { return require('./sync-repository-documentdb').SyncRepositoryDocumentDB; },
};
