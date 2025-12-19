const {
    ScriptExecutionRepositoryMongo,
} = require('./script-execution-repository-mongo');
const {
    ScriptExecutionRepositoryPostgres,
} = require('./script-execution-repository-postgres');
const {
    ScriptExecutionRepositoryDocumentDB,
} = require('./script-execution-repository-documentdb');
const config = require('../../database/config');

/**
 * Script Execution Repository Factory
 * Creates the appropriate repository adapter based on database type
 *
 * This implements the Factory pattern for Hexagonal Architecture:
 * - Reads database type from app definition (backend/index.js)
 * - Returns correct adapter (MongoDB, DocumentDB, or PostgreSQL)
 * - Provides clear error for unsupported databases
 *
 * Usage:
 * ```javascript
 * const repository = createScriptExecutionRepository();
 * ```
 *
 * @returns {ScriptExecutionRepositoryInterface} Configured repository adapter
 * @throws {Error} If database type is not supported
 */
function createScriptExecutionRepository() {
    const dbType = config.DB_TYPE;

    switch (dbType) {
        case 'mongodb':
            return new ScriptExecutionRepositoryMongo();

        case 'postgresql':
            return new ScriptExecutionRepositoryPostgres();

        case 'documentdb':
            return new ScriptExecutionRepositoryDocumentDB();

        default:
            throw new Error(
                `Unsupported database type: ${dbType}. Supported values: 'mongodb', 'documentdb', 'postgresql'`
            );
    }
}

module.exports = {
    createScriptExecutionRepository,
    // Export adapters for direct testing
    ScriptExecutionRepositoryMongo,
    ScriptExecutionRepositoryPostgres,
    ScriptExecutionRepositoryDocumentDB,
};
