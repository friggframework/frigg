const { ProcessRepositoryMongoDBNative } = require('./process-repository-mongodb-native');
const { ProcessRepositoryPostgres } = require('./process-repository-postgres');
const config = require('../../database/config');

function createProcessRepository() {
    const dbType = config.DB_TYPE;

    switch (dbType) {
        case 'mongodb':
        case 'documentdb':
            return new ProcessRepositoryMongoDBNative();

        case 'postgresql':
            return new ProcessRepositoryPostgres();

        default:
            throw new Error(
                `Unsupported database type: ${dbType}. Supported values: 'mongodb', 'documentdb', 'postgresql'`
            );
    }
}

module.exports = {
    createProcessRepository,
    ProcessRepositoryMongoDBNative,
    ProcessRepositoryPostgres,
};
