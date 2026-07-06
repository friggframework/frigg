const { AdminScriptExecutionRepositoryMongo } = require('./admin-script-execution-repository-mongo');
const { AdminScriptExecutionRepositoryPostgres } = require('./admin-script-execution-repository-postgres');
const {
    AdminScriptExecutionRepositoryDocumentDB,
} = require('./admin-script-execution-repository-documentdb');
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
 * const repository = createAdminScriptExecutionRepository();
 * ```
 *
 * @returns {AdminScriptExecutionRepositoryInterface} Configured repository adapter
 * @throws {Error} If database type is not supported
 */
function createAdminScriptExecutionRepository() {
    const dbType = config.DB_TYPE;

    switch (dbType) {
        case 'mongodb':
            return new AdminScriptExecutionRepositoryMongo();

        case 'postgresql':
            return new AdminScriptExecutionRepositoryPostgres();

        case 'documentdb':
            return new AdminScriptExecutionRepositoryDocumentDB();

        default:
            throw new Error(
                `Unsupported database type: ${dbType}. Supported values: 'mongodb', 'documentdb', 'postgresql'`
            );
    }
}

module.exports = {
    createAdminScriptExecutionRepository,
    // Export adapters for direct testing
    AdminScriptExecutionRepositoryMongo,
    AdminScriptExecutionRepositoryPostgres,
    AdminScriptExecutionRepositoryDocumentDB,
};
