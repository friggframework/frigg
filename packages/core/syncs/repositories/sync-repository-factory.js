const { SyncRepositoryMongoDBNative } = require('./sync-repository-mongodb-native');
const { SyncRepositoryPostgres } = require('./sync-repository-postgres');
const config = require('../../database/config');

function createSyncRepository() {
    const dbType = config.DB_TYPE;

    switch (dbType) {
        case 'mongodb':
        case 'documentdb':
            return new SyncRepositoryMongoDBNative();

        case 'postgresql':
            return new SyncRepositoryPostgres();

        default:
            throw new Error(
                `Unsupported database type: ${dbType}. Supported values: 'mongodb', 'documentdb', 'postgresql'`
            );
    }
}

module.exports = {
    createSyncRepository,
    SyncRepositoryMongoDBNative,
    SyncRepositoryPostgres,
};
