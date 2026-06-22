const { createReportingRouter } = require('./reporting-router');
const {
    createReportingRepository,
    ReportingRepositoryMongo,
    ReportingRepositoryPostgres,
    ReportingRepositoryDocumentDB,
} = require('./repositories/reporting-repository-factory');
const { ListIntegrationsReport } = require('./use-cases');

module.exports = {
    createReportingRouter,
    createReportingRepository,
    ReportingRepositoryMongo,
    ReportingRepositoryPostgres,
    ReportingRepositoryDocumentDB,
    ListIntegrationsReport,
};
