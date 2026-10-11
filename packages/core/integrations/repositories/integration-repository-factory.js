const { IntegrationRepositoryMongo } = require('./integration-repository-mongo');
const { IntegrationRepositoryPostgres } = require('./integration-repository-postgres');
const {
    IntegrationRepositoryDocumentDB,
} = require('./integration-repository-documentdb');
const {
    IntegrationRepositorySqlite,
} = require('./integration-repository-sqlite');
const config = require('../../database/config');

/**
 * Integration Repository Factory
 * Creates the appropriate repository adapter based on database type
 *
 * This implements the Factory pattern for Hexagonal Architecture:
 * - Reads database type from app definition (backend/index.js)
 * - Returns correct adapter (MongoDB, PostgreSQL, or SQLite)
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
    const dbType = config.DB_TYPE;

    switch (dbType) {
        case 'mongodb':
            return new IntegrationRepositoryMongo();

        case 'postgresql':
            return new IntegrationRepositoryPostgres();

        case 'documentdb':
            return new IntegrationRepositoryDocumentDB();

        case 'sqlite':
            return new IntegrationRepositorySqlite();

        default:
            throw new Error(
                `Unsupported database type: ${dbType}. Supported values: 'mongodb', 'documentdb', 'postgresql', 'sqlite'`
            );
    }
}

module.exports = {
    createIntegrationRepository,
    // Export adapters for direct testing
    IntegrationRepositoryMongo,
    IntegrationRepositoryPostgres,
    IntegrationRepositoryDocumentDB,
    IntegrationRepositorySqlite,
};
