const { HealthCheckRepositoryMongoDBNative } = require('./health-check-repository-mongodb-native');
const { HealthCheckRepositoryPostgres } = require('./health-check-repository-postgres');
const config = require('../../database/config');

function createHealthCheckRepository() {
    const dbType = config.DB_TYPE;

    switch (dbType) {
        case 'mongodb':
        case 'documentdb':
            return new HealthCheckRepositoryMongoDBNative();

        case 'postgresql':
            return new HealthCheckRepositoryPostgres();

        default:
            throw new Error(
                `Unsupported database type: ${dbType}. Supported values: 'mongodb', 'documentdb', 'postgresql'`
            );
    }
}

module.exports = {
    createHealthCheckRepository,
    HealthCheckRepositoryMongoDBNative,
    HealthCheckRepositoryPostgres,
};
