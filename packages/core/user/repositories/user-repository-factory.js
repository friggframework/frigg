const { UserRepositoryMongo } = require('./user-repository-mongo');
const { UserRepositoryPostgres } = require('./user-repository-postgres');

/**
 * User Repository Factory
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
 * const repository = createUserRepository({ userConfig: {} });
 * const user = await repository.findUserById(id); // ID is string
 * ```
 *
 * @param {Object} config - Repository configuration
 * @param {Object} config.userConfig - The user config in the app definition
 * @param {Object} [config.prismaClient] - Optional Prisma client for testing
 * @param {Object} [config.tokenRepository] - Optional token repository for testing
 * @returns {UserRepositoryInterface} Configured repository adapter
 */
function createUserRepository(config) {
    const dbType = process.env.DB_TYPE || 'mongodb';

    switch (dbType) {
        case 'mongodb':
            return new UserRepositoryMongo(config);

        case 'postgresql':
            return new UserRepositoryPostgres(config);

        default:
            throw new Error(
                `Unsupported DB_TYPE: ${dbType}. Supported values: 'mongodb', 'postgresql'`
            );
    }
}

module.exports = {
    createUserRepository,
    // Export adapters for direct testing
    UserRepositoryMongo,
    UserRepositoryPostgres,
};
