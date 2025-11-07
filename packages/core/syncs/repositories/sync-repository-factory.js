const { SyncRepositoryMongo } = require('./sync-repository-mongo');
const { SyncRepositoryPostgres } = require('./sync-repository-postgres');
const { SyncRepositoryDocumentDB } = require('./sync-repository-documentdb');
const { isDocumentDB } = require('../../database/utils/documentdb-compatibility');
const config = require('../../database/config');

function createSyncRepository() {
    if (isDocumentDB()) {
        return new SyncRepositoryDocumentDB();
    }

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
    SyncRepositoryMongo,
    SyncRepositoryPostgres,
    SyncRepositoryDocumentDB,
};
