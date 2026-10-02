const { UsageRepositoryPrisma } = require('./usage-repository-prisma');
const { UsageRepositoryDocumentDB } = require('./usage-repository-documentdb');
const config = require('../../database/config');

function createUsageRepository() {
    const dbType = config.DB_TYPE;

    switch (dbType) {
        case 'mongodb':
        case 'postgresql':
            return new UsageRepositoryPrisma();
        case 'documentdb':
            return new UsageRepositoryDocumentDB();
        default:
            throw new Error(
                `Unsupported database type: ${dbType}. Supported values: 'mongodb', 'documentdb', 'postgresql'`
            );
    }
}

module.exports = {
    createUsageRepository,
    UsageRepositoryPrisma,
    UsageRepositoryDocumentDB,
};
