const { ProcessRepositoryMongo } = require('./process-repository-mongo');
const { ProcessRepositoryPostgres } = require('./process-repository-postgres');
const {
    ProcessRepositoryDocumentDB,
} = require('./process-repository-documentdb');
const {
    ProcessRepositorySqlite,
} = require('./process-repository-sqlite');
const config = require('../../database/config');

/**
 * Process Repository Factory
 * Creates the appropriate repository adapter based on database type
 *
 * This implements the Factory pattern for Hexagonal Architecture:
 * - Reads database type from app definition (backend/index.js)
 * - Returns correct adapter (MongoDB, PostgreSQL, or SQLite)
 * - Provides clear error for unsupported databases
 *
 * Usage:
 * ```javascript
 * const repository = createProcessRepository();
 * await repository.create({ userId, integrationId, name, type, state });
 * ```
 *
 * @returns {ProcessRepositoryInterface} Configured repository adapter
 * @throws {Error} If database type is not supported
 */
function createProcessRepository() {
    const dbType = config.DB_TYPE;

    switch (dbType) {
        case 'mongodb':
            return new ProcessRepositoryMongo();

        case 'postgresql':
            return new ProcessRepositoryPostgres();

        case 'documentdb':
            return new ProcessRepositoryDocumentDB();

        case 'sqlite':
            return new ProcessRepositorySqlite();

        default:
            throw new Error(
                `Unsupported database type: ${dbType}. Supported values: 'mongodb', 'documentdb', 'postgresql', 'sqlite'`
            );
    }
}

module.exports = {
    createProcessRepository,
    // Export adapters for direct testing
    ProcessRepositoryMongo,
    ProcessRepositoryPostgres,
    ProcessRepositoryDocumentDB,
    ProcessRepositorySqlite,
};

