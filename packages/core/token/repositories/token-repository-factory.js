const { TokenRepositoryMongo } = require('./token-repository-mongo');
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
    // Export adapters for direct testing
    TokenRepositoryMongo,
    TokenRepositoryPostgres,
};
