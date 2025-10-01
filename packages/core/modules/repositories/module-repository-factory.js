const { ModuleRepositoryMongo } = require('./module-repository-mongo');
const { ModuleRepositoryPostgres } = require('./module-repository-postgres');

/**
 * Module Repository Factory
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
 * const repository = createModuleRepository();
 * const entity = await repository.findEntityById(id); // ID is string
 * ```
 *
 * @param {Object} [prismaClient] - Optional Prisma client for testing
 * @returns {ModuleRepositoryInterface} Configured repository adapter
 */
function createModuleRepository(prismaClient) {
    const dbType = process.env.DB_TYPE || 'mongodb';

    switch (dbType) {
        case 'mongodb':
            return new ModuleRepositoryMongo(prismaClient);

        case 'postgresql':
            return new ModuleRepositoryPostgres(prismaClient);

        default:
            throw new Error(
                `Unsupported DB_TYPE: ${dbType}. Supported values: 'mongodb', 'postgresql'`
            );
    }
}

module.exports = {
    createModuleRepository,
    // Export adapters for direct testing
    ModuleRepositoryMongo,
    ModuleRepositoryPostgres,
};
