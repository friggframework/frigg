const {
    ScriptExecutionRepositoryPostgres,
} = require('./script-execution-repository-postgres');
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
            const { ScriptExecutionRepositoryMongo } = require('./script-execution-repository-mongo');
            return new ScriptExecutionRepositoryMongo();

        case 'postgresql':
            return new ScriptExecutionRepositoryPostgres();

        case 'documentdb':
            const { ScriptExecutionRepositoryDocumentDB } = require('./script-execution-repository-documentdb');
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
    get ScriptExecutionRepositoryMongo() { return require('./script-execution-repository-mongo').ScriptExecutionRepositoryMongo; },
    ScriptExecutionRepositoryPostgres,
    get ScriptExecutionRepositoryDocumentDB() { return require('./script-execution-repository-documentdb').ScriptExecutionRepositoryDocumentDB; },
};
