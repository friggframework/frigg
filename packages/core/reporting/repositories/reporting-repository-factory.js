const { ReportingRepositoryMongo } = require('./reporting-repository-mongo');
const {
    ReportingRepositoryPostgres,
} = require('./reporting-repository-postgres');
const {
    ReportingRepositoryDocumentDB,
} = require('./reporting-repository-documentdb');
const config = require('../../database/config');

function createReportingRepository() {
    const dbType = config.DB_TYPE;

    switch (dbType) {
        case 'mongodb':
            return new ReportingRepositoryMongo();

        case 'postgresql':
            return new ReportingRepositoryPostgres();

        case 'documentdb':
            return new ReportingRepositoryDocumentDB();

        default:
            throw new Error(
                `Unsupported database type: ${dbType}. Supported values: 'mongodb', 'documentdb', 'postgresql'`
            );
    }
}

module.exports = {
    createReportingRepository,
    ReportingRepositoryMongo,
    ReportingRepositoryPostgres,
    ReportingRepositoryDocumentDB,
};
