const {
    createUsageRepository,
    UsageRepositoryPrisma,
    UsageRepositoryDocumentDB,
} = require('./repositories/usage-repository-factory');
const {
    UsageRepositoryInterface,
} = require('./repositories/usage-repository-interface');
const { computeTrackedMetrics } = require('./tracked-metrics');

module.exports = {
    createUsageRepository,
    computeTrackedMetrics,
    UsageRepositoryInterface,
    UsageRepositoryPrisma,
    UsageRepositoryDocumentDB,
};
