const { ModuleRepository } = require('./module-repository');

/**
 * Module Repository Factory
 * Creates the appropriate repository adapter based on database type
 *
 * Note: Currently, Entity model has identical structure across MongoDB and PostgreSQL,
 * so this factory always returns ModuleRepository. This pattern is maintained for:
 * - Consistency with other repository factories
 * - Future-proofing if database-specific implementations become needed
 * - Unified API for repository instantiation across the codebase
 *
 * Usage:
 * ```javascript
 * const repository = createModuleRepository();
 * const entity = await repository.findEntityById(id);
 * ```
 *
 * @param {Object} [prismaClient] - Optional Prisma client for testing
 * @returns {ModuleRepositoryInterface} Configured repository adapter
 */
function createModuleRepository(prismaClient) {
    const dbType = process.env.DB_TYPE || 'mongodb';

    // Currently, ModuleRepository works identically for both databases
    // If database-specific logic is needed in the future, add cases here:
    switch (dbType) {
        case 'mongodb':
            return new ModuleRepository(prismaClient);

        case 'postgresql':
            return new ModuleRepository(prismaClient);

        default:
            throw new Error(
                `Unsupported DB_TYPE: ${dbType}. Supported values: 'mongodb', 'postgresql'`
            );
    }
}

module.exports = {
    createModuleRepository,
    // Export adapter for direct testing
    ModuleRepository,
};
