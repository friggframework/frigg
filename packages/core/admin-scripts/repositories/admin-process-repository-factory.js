const { AdminProcessRepositoryPostgres } = require('./admin-process-repository-postgres');
const {
    AdminProcessRepositoryDocumentDB,
} = require('./admin-process-repository-documentdb');
const config = require('../../database/config');

/**
 * Admin Process Repository Factory
 * Creates the appropriate repository adapter based on database type
 *
 * This implements the Factory pattern for Hexagonal Architecture:
 * - Reads database type from app definition (backend/index.js)
 * - Returns correct adapter (MongoDB, DocumentDB, or PostgreSQL)
 * - Provides clear error for unsupported databases
 *
 * Usage:
 * ```javascript
 * const repository = createAdminProcessRepository();
 * ```
 *
 * @returns {AdminProcessRepositoryInterface} Configured repository adapter
 * @throws {Error} If database type is not supported
 */
function createAdminProcessRepository() {
    const dbType = config.DB_TYPE;

    switch (dbType) {
        case 'mongodb':
            const { AdminProcessRepositoryMongo } = require('./admin-process-repository-mongo');
            return new AdminProcessRepositoryMongo();

        case 'postgresql':
            return new AdminProcessRepositoryPostgres();

        case 'documentdb':
            return new AdminProcessRepositoryDocumentDB();

        default:
            throw new Error(
                `Unsupported database type: ${dbType}. Supported values: 'mongodb', 'documentdb', 'postgresql'`
            );
    }
}

module.exports = {
    createAdminProcessRepository,
    // Export adapters for direct testing
    get AdminProcessRepositoryMongo() { return require('./admin-process-repository-mongo').AdminProcessRepositoryMongo; },
    AdminProcessRepositoryPostgres,
    AdminProcessRepositoryDocumentDB,
};
