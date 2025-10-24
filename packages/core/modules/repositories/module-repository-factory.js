const { ModuleRepositoryMongo } = require('./module-repository-mongo');
const { ModuleRepositoryPostgres } = require('./module-repository-postgres');
const config = require('../../database/config');

/**
 * Module Repository Factory
 * Creates the appropriate repository adapter based on database type
 *
 * @returns {ModuleRepositoryInterface} Configured repository adapter
 */
function createModuleRepository() {
    const dbType = config.DB_TYPE;

    switch (dbType) {
        case 'mongodb':
            return new ModuleRepositoryMongo();

        case 'postgresql':
            return new ModuleRepositoryPostgres();

        default:
            throw new Error(
                `Unsupported database type: ${dbType}. Supported values: 'mongodb', 'postgresql'`
            );
    }
}

module.exports = {
    createModuleRepository,
    // Export adapters for direct testing
    ModuleRepositoryMongo,
    ModuleRepositoryPostgres,
};
