const { ModuleRepositoryMongo } = require('./module-repository-mongo');
const { ModuleRepositoryPostgres } = require('./module-repository-postgres');
const {
    ModuleRepositoryDocumentDB,
} = require('./module-repository-documentdb');
const {
    ModuleRepositorySqlite,
} = require('./module-repository-sqlite');
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

        case 'documentdb':
            return new ModuleRepositoryDocumentDB();

        case 'sqlite':
            return new ModuleRepositorySqlite();

        default:
            throw new Error(
                `Unsupported database type: ${dbType}. Supported values: 'mongodb', 'documentdb', 'postgresql', 'sqlite'`
            );
    }
}

module.exports = {
    createModuleRepository,
    // Export adapters for direct testing
    ModuleRepositoryMongo,
    ModuleRepositoryPostgres,
    ModuleRepositoryDocumentDB,
    ModuleRepositorySqlite,
};
