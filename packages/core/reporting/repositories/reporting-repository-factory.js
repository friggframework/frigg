const { ReportingRepositoryMongo } = require('./reporting-repository-mongo');
const {
    ReportingRepositoryPostgres,
} = require('./reporting-repository-postgres');
const {
    ReportingRepositoryDocumentDB,
} = require('./reporting-repository-documentdb');
const config = require('../../database/config');

/**
 * Reporting Repository Factory
 * Creates the appropriate reporting adapter based on database type.
 *
 * @returns {ReportingRepositoryInterface} Configured repository adapter
 */
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
    // Export adapters for direct testing
    ReportingRepositoryMongo,
    ReportingRepositoryPostgres,
    ReportingRepositoryDocumentDB,
};
