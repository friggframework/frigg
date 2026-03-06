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
            const { ModuleRepositoryMongo } = require('./module-repository-mongo');
            return new ModuleRepositoryMongo();

        case 'postgresql':
            return new ModuleRepositoryPostgres();

        case 'documentdb':
            const { ModuleRepositoryDocumentDB } = require('./module-repository-documentdb');
            return new ModuleRepositoryDocumentDB();

        default:
            throw new Error(
                `Unsupported database type: ${dbType}. Supported values: 'mongodb', 'documentdb', 'postgresql'`
            );
    }
}

module.exports = {
    createModuleRepository,
    // Export adapters for direct testing
    get ModuleRepositoryMongo() { return require('./module-repository-mongo').ModuleRepositoryMongo; },
    ModuleRepositoryPostgres,
    get ModuleRepositoryDocumentDB() { return require('./module-repository-documentdb').ModuleRepositoryDocumentDB; },
};
