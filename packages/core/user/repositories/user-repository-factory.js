const { UserRepository } = require('./user-repository');

/**
 * User Repository Factory
 * Creates the appropriate repository adapter based on database type
 *
 * Note: Currently, User model has identical structure across MongoDB and PostgreSQL,
 * so this factory always returns UserRepository. This pattern is maintained for:
 * - Consistency with other repository factories
 * - Future-proofing if database-specific implementations become needed
 * - Unified API for repository instantiation across the codebase
 *
 * Usage:
 * ```javascript
 * const repository = createUserRepository({ userConfig: {} });
 * const user = await repository.findUserById(id);
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

    // Currently, UserRepository works identically for both databases
    // If database-specific logic is needed in the future, add cases here:
    switch (dbType) {
        case 'mongodb':
            return new UserRepository(config);

        case 'postgresql':
            return new UserRepository(config);

        default:
            throw new Error(
                `Unsupported DB_TYPE: ${dbType}. Supported values: 'mongodb', 'postgresql'`
            );
    }
}

module.exports = {
    createUserRepository,
    // Export adapter for direct testing
    UserRepository,
};
