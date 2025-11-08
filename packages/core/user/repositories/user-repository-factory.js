const { UserRepositoryMongoDBNative } = require('./user-repository-mongodb-native');
const { UserRepositoryPostgres } = require('./user-repository-postgres');
const config = require('../../database/config');

function createUserRepository() {
    const dbType = config.DB_TYPE;

    switch (dbType) {
        case 'mongodb':
        case 'documentdb':
            return new UserRepositoryMongoDBNative();

        case 'postgresql':
            return new UserRepositoryPostgres();

        default:
            throw new Error(
                `Unsupported database type: ${dbType}. Supported values: 'mongodb', 'documentdb', 'postgresql'`
            );
    }
}

module.exports = {
    createUserRepository,
    UserRepositoryMongoDBNative,
    UserRepositoryPostgres,
};
