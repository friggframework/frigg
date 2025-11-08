const { ModuleRepositoryMongoDBNative } = require('./module-repository-mongodb-native');
const { ModuleRepositoryPostgres } = require('./module-repository-postgres');
const config = require('../../database/config');

function createModuleRepository() {
    const dbType = config.DB_TYPE;

    switch (dbType) {
        case 'mongodb':
        case 'documentdb':
            return new ModuleRepositoryMongoDBNative();

        case 'postgresql':
            return new ModuleRepositoryPostgres();

        default:
            throw new Error(
                `Unsupported database type: ${dbType}. Supported values: 'mongodb', 'documentdb', 'postgresql'`
            );
    }
}

module.exports = {
    createModuleRepository,
    ModuleRepositoryMongoDBNative,
    ModuleRepositoryPostgres,
};
