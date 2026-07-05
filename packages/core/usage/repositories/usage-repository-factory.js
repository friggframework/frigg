const { UsageRepositoryMongo } = require('./usage-repository-mongo');
const { UsageRepositoryPostgres } = require('./usage-repository-postgres');
const { UsageRepositoryDocumentDB } = require('./usage-repository-documentdb');
const config = require('../../database/config');

function createUsageRepository() {
    const dbType = config.DB_TYPE;

    switch (dbType) {
        case 'mongodb':
            return new UsageRepositoryMongo();
        case 'postgresql':
            return new UsageRepositoryPostgres();
        case 'documentdb':
            return new UsageRepositoryDocumentDB();
        default:
            throw new Error(
                `Unsupported database type: ${dbType}. Supported values: 'mongodb', 'documentdb', 'postgresql'`
            );
    }
}

module.exports = {
    createUsageRepository,
    UsageRepositoryMongo,
    UsageRepositoryPostgres,
    UsageRepositoryDocumentDB,
};
