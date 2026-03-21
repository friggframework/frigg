const {
    IntegrationRepositoryPostgres,
} = require('./integration-repository-postgres');
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
    const dbType = config.DB_TYPE;

    switch (dbType) {
        case 'mongodb':
            const { IntegrationRepositoryMongo } = require('./integration-repository-mongo');
            return new IntegrationRepositoryMongo();

        case 'postgresql':
            return new IntegrationRepositoryPostgres();

        case 'documentdb':
            const { IntegrationRepositoryDocumentDB } = require('./integration-repository-documentdb');
            return new IntegrationRepositoryDocumentDB();

        default:
            throw new Error(
                `Unsupported database type: ${dbType}. Supported values: 'mongodb', 'documentdb', 'postgresql'`
            );
    }
}

module.exports = {
    createIntegrationRepository,
    // Export adapters for direct testing
    get IntegrationRepositoryMongo() { return require('./integration-repository-mongo').IntegrationRepositoryMongo; },
    IntegrationRepositoryPostgres,
    get IntegrationRepositoryDocumentDB() { return require('./integration-repository-documentdb').IntegrationRepositoryDocumentDB; },
};
