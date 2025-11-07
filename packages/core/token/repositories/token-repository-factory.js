const { TokenRepositoryMongo } = require('./token-repository-mongo');
const { TokenRepositoryPostgres } = require('./token-repository-postgres');
const { TokenRepositoryDocumentDB } = require('./token-repository-documentdb');
const { isDocumentDB } = require('../../database/utils/documentdb-compatibility');
const config = require('../../database/config');

function createTokenRepository() {
    if (isDocumentDB()) {
        return new TokenRepositoryDocumentDB();
    }

    const dbType = config.DB_TYPE;

    switch (dbType) {
        case 'mongodb':
            return new TokenRepositoryMongo();

        case 'postgresql':
            return new TokenRepositoryPostgres();

        default:
            throw new Error(
                `Unsupported database type: ${dbType}. Supported values: 'mongodb', 'postgresql'`
            );
    }
}

module.exports = {
    createTokenRepository,
    TokenRepositoryMongo,
    TokenRepositoryPostgres,
    TokenRepositoryDocumentDB,
};
