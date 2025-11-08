const { TokenRepositoryMongoDBNative } = require('./token-repository-mongodb-native');
const { TokenRepositoryPostgres } = require('./token-repository-postgres');
const config = require('../../database/config');

function createTokenRepository() {
    const dbType = config.DB_TYPE;

    switch (dbType) {
        case 'mongodb':
        case 'documentdb':
            return new TokenRepositoryMongoDBNative();

        case 'postgresql':
            return new TokenRepositoryPostgres();

        default:
            throw new Error(
                `Unsupported database type: ${dbType}. Supported values: 'mongodb', 'documentdb', 'postgresql'`
            );
    }
}

module.exports = {
    createTokenRepository,
    TokenRepositoryMongoDBNative,
    TokenRepositoryPostgres,
};
