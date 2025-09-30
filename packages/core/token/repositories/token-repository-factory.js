const { TokenRepository } = require('./token-repository');

/**
 * Token Repository Factory
 * Creates the appropriate repository adapter based on database type
 *
 * Note: Currently, Token model has identical structure across MongoDB and PostgreSQL,
 * so this factory always returns TokenRepository. This pattern is maintained for:
 * - Consistency with other repository factories
 * - Future-proofing if database-specific implementations become needed
 * - Unified API for repository instantiation across the codebase
 *
 * Usage:
 * ```javascript
 * const repository = createTokenRepository();
 * const token = await repository.createTokenWithExpire(userId, rawToken, 120);
 * ```
 *
 * @param {Object} [prismaClient] - Optional Prisma client for testing
 * @returns {TokenRepositoryInterface} Configured repository adapter
 */
function createTokenRepository(prismaClient) {
    const dbType = process.env.DB_TYPE || 'mongodb';

    // Currently, TokenRepository works identically for both databases
    // If database-specific logic is needed in the future, add cases here:
    switch (dbType) {
        case 'mongodb':
            return new TokenRepository(prismaClient);

        case 'postgresql':
            return new TokenRepository(prismaClient);

        default:
            throw new Error(
                `Unsupported DB_TYPE: ${dbType}. Supported values: 'mongodb', 'postgresql'`
            );
    }
}

module.exports = {
    createTokenRepository,
    // Export adapter for direct testing
    TokenRepository,
};
