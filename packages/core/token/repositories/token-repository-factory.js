const { TokenRepositoryPostgres } = require('./token-repository-postgres');
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
            const { TokenRepositoryMongo } = require('./token-repository-mongo');
            return new TokenRepositoryMongo();

        case 'postgresql':
            return new TokenRepositoryPostgres();

        case 'documentdb':
            const { TokenRepositoryDocumentDB } = require('./token-repository-documentdb');
            return new TokenRepositoryDocumentDB();

        default:
            throw new Error(
                `Unsupported database type: ${dbType}. Supported values: 'mongodb', 'documentdb', 'postgresql'`
            );
    }
}

module.exports = {
    createTokenRepository,
    // Export adapters for direct testing
    get TokenRepositoryMongo() { return require('./token-repository-mongo').TokenRepositoryMongo; },
    TokenRepositoryPostgres,
    get TokenRepositoryDocumentDB() { return require('./token-repository-documentdb').TokenRepositoryDocumentDB; },
};
