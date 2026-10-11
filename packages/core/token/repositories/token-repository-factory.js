const { TokenRepositoryMongo } = require('./token-repository-mongo');
const { TokenRepositoryPostgres } = require('./token-repository-postgres');
const {
    TokenRepositoryDocumentDB,
} = require('./token-repository-documentdb');
const {
    TokenRepositorySqlite,
} = require('./token-repository-sqlite');
const config = require('../../database/config');

/**
 * Token Repository Factory
 * Creates the appropriate repository adapter based on database type
 *
 * @returns {TokenRepositoryInterface} Configured repository adapter
 */
function createTokenRepository() {
    const dbType = config.DB_TYPE;

    switch (dbType) {
        case 'mongodb':
            return new TokenRepositoryMongo();

        case 'postgresql':
            return new TokenRepositoryPostgres();

        case 'documentdb':
            return new TokenRepositoryDocumentDB();

        case 'sqlite':
            return new TokenRepositorySqlite();

        default:
            throw new Error(
                `Unsupported database type: ${dbType}. Supported values: 'mongodb', 'documentdb', 'postgresql', 'sqlite'`
            );
    }
}

module.exports = {
    createTokenRepository,
    // Export adapters for direct testing
    TokenRepositoryMongo,
    TokenRepositoryPostgres,
    TokenRepositoryDocumentDB,
    TokenRepositorySqlite,
};
