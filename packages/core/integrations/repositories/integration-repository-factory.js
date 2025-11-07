const { IntegrationRepositoryMongo } = require('./integration-repository-mongo');
const { IntegrationRepositoryPostgres } = require('./integration-repository-postgres');
const { IntegrationRepositoryDocumentDB } = require('./integration-repository-documentdb');
const { isDocumentDB } = require('../../database/utils/documentdb-compatibility');
const config = require('../../database/config');

/**
 * Integration Repository Factory
 * Creates the appropriate repository adapter based on database type
 *
 * This implements the Factory pattern for Hexagonal Architecture:
 * - Reads database type from app definition (backend/index.js)
 * - Returns correct adapter (MongoDB or PostgreSQL)
 * - Provides clear error for unsupported databases
 *
 * Usage:
 * ```javascript
 * const repository = createIntegrationRepository();
 * ```
 *
 * @returns {IntegrationRepositoryInterface} Configured repository adapter
 * @throws {Error} If database type is not supported
 */
function createIntegrationRepository() {
    if (isDocumentDB()) {
        return new IntegrationRepositoryDocumentDB();
    }

    const dbType = config.DB_TYPE;

    switch (dbType) {
        case 'mongodb':
            return new IntegrationRepositoryMongo();

        case 'postgresql':
            return new IntegrationRepositoryPostgres();

        default:
            throw new Error(
                `Unsupported database type: ${dbType}. Supported values: 'mongodb', 'postgresql'`
            );
    }
}

module.exports = {
    createIntegrationRepository,
    IntegrationRepositoryMongo,
    IntegrationRepositoryPostgres,
    IntegrationRepositoryDocumentDB,
};
