const { IntegrationMappingRepositoryMongoDBNative } = require('./integration-mapping-repository-mongodb-native');
const { IntegrationMappingRepositoryPostgres } = require('./integration-mapping-repository-postgres');
const config = require('../../database/config');

function createIntegrationMappingRepository() {
    const dbType = config.DB_TYPE;

    switch (dbType) {
        case 'mongodb':
        case 'documentdb':
            return new IntegrationMappingRepositoryMongoDBNative();

        case 'postgresql':
            return new IntegrationMappingRepositoryPostgres();

        default:
            throw new Error(
                `Unsupported database type: ${dbType}. Supported values: 'mongodb', 'documentdb', 'postgresql'`
            );
    }
}

module.exports = {
    createIntegrationMappingRepository,
    IntegrationMappingRepositoryMongoDBNative,
    IntegrationMappingRepositoryPostgres,
};
