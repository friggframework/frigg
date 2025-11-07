const { ModuleRepositoryMongo } = require('./module-repository-mongo');
const { ModuleRepositoryPostgres } = require('./module-repository-postgres');
const { ModuleRepositoryDocumentDB } = require('./module-repository-documentdb');
const { isDocumentDB } = require('../../database/utils/documentdb-compatibility');
const config = require('../../database/config');

function createModuleRepository() {
    if (isDocumentDB()) {
        return new ModuleRepositoryDocumentDB();
    }

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
    ModuleRepositoryMongo,
    ModuleRepositoryPostgres,
    ModuleRepositoryDocumentDB,
};
