const { TokenRepositoryMongo } = require('./token-repository-mongo');
const { TokenRepositoryPostgres } = require('./token-repository-postgres');

/**
 * Token Repository Factory
 * Creates the appropriate repository adapter based on database type
 *
 * Database-specific implementations:
 * - MongoDB: Uses String IDs (ObjectId), no conversion needed
 * - PostgreSQL: Uses Int IDs, converts String ↔ Int
 *
 * All repository methods return String IDs regardless of database type,
 * ensuring application layer consistency.
 *
 * Usage:
 * ```javascript
 * const repository = createTokenRepository();
 * const token = await repository.createTokenWithExpire(userId, rawToken, 120); // userId is string
 * ```
 *
 * @param {Object} [prismaClient] - Optional Prisma client for testing
 * @returns {TokenRepositoryInterface} Configured repository adapter
 */
function createTokenRepository(prismaClient) {
    const dbType = process.env.DB_TYPE || 'mongodb';

    switch (dbType) {
        case 'mongodb':
            return new TokenRepositoryMongo(prismaClient);

        case 'postgresql':
            return new TokenRepositoryPostgres(prismaClient);

        default:
            throw new Error(
                `Unsupported DB_TYPE: ${dbType}. Supported values: 'mongodb', 'postgresql'`
            );
    }
}

module.exports = {
    createTokenRepository,
    // Export adapters for direct testing
    TokenRepositoryMongo,
    TokenRepositoryPostgres,
};
