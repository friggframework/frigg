const {
    AdminApiKeyRepositoryPostgres,
} = require('./admin-api-key-repository-postgres');
const config = require('../../database/config');

/**
 * Admin API Key Repository Factory
 * Creates the appropriate repository adapter based on database type
 *
 * This implements the Factory pattern for Hexagonal Architecture:
 * - Reads database type from app definition (backend/index.js)
 * - Returns correct adapter (MongoDB, DocumentDB, or PostgreSQL)
 * - Provides clear error for unsupported databases
 *
 * Usage:
 * ```javascript
 * const repository = createAdminApiKeyRepository();
 * ```
 *
 * @returns {AdminApiKeyRepositoryInterface} Configured repository adapter
 * @throws {Error} If database type is not supported
 */
function createAdminApiKeyRepository() {
    const dbType = config.DB_TYPE;

    switch (dbType) {
        case 'mongodb':
            const { AdminApiKeyRepositoryMongo } = require('./admin-api-key-repository-mongo');
            return new AdminApiKeyRepositoryMongo();

        case 'postgresql':
            return new AdminApiKeyRepositoryPostgres();

        case 'documentdb':
            const { AdminApiKeyRepositoryDocumentDB } = require('./admin-api-key-repository-documentdb');
            return new AdminApiKeyRepositoryDocumentDB();

        default:
            throw new Error(
                `Unsupported database type: ${dbType}. Supported values: 'mongodb', 'documentdb', 'postgresql'`
            );
    }
}

module.exports = {
    createAdminApiKeyRepository,
    // Export adapters for direct testing
    get AdminApiKeyRepositoryMongo() { return require('./admin-api-key-repository-mongo').AdminApiKeyRepositoryMongo; },
    AdminApiKeyRepositoryPostgres,
    get AdminApiKeyRepositoryDocumentDB() { return require('./admin-api-key-repository-documentdb').AdminApiKeyRepositoryDocumentDB; },
};
