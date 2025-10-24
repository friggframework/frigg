const { UserRepositoryMongo } = require('./user-repository-mongo');
const { UserRepositoryPostgres } = require('./user-repository-postgres');
const databaseConfig = require('../../database/config');

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
 * const repository = createUserRepository();
 * const user = await repository.findUserById(id); // ID is string
 * ```
 *
 * @returns {UserRepositoryInterface} Configured repository adapter
 */
function createUserRepository() {
    const dbType = databaseConfig.DB_TYPE;

    switch (dbType) {
        case 'mongodb':
            return new UserRepositoryMongo();

        case 'postgresql':
            return new UserRepositoryPostgres();

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
