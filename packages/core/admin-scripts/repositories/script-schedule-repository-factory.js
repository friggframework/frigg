const { ScriptScheduleRepositoryPostgres } = require('./script-schedule-repository-postgres');
const config = require('../../database/config');

/**
 * Script Schedule Repository Factory
 * Creates the appropriate repository adapter based on database type
 *
 * This implements the Factory pattern for Hexagonal Architecture:
 * - Reads database type from app definition (backend/index.js)
 * - Returns correct adapter (MongoDB, DocumentDB, or PostgreSQL)
 * - Provides clear error for unsupported databases
 *
 * Usage:
 * ```javascript
 * const repository = createScriptScheduleRepository();
 * ```
 *
 * @returns {ScriptScheduleRepositoryInterface} Configured repository adapter
 * @throws {Error} If database type is not supported
 */
function createScriptScheduleRepository() {
    const dbType = config.DB_TYPE;

    switch (dbType) {
        case 'mongodb':
            const { ScriptScheduleRepositoryMongo } = require('./script-schedule-repository-mongo');
            return new ScriptScheduleRepositoryMongo();

        case 'postgresql':
            return new ScriptScheduleRepositoryPostgres();

        case 'documentdb':
            const { ScriptScheduleRepositoryDocumentDB } = require('./script-schedule-repository-documentdb');
            return new ScriptScheduleRepositoryDocumentDB();

        default:
            throw new Error(
                `Unsupported database type: ${dbType}. Supported values: 'mongodb', 'documentdb', 'postgresql'`
            );
    }
}

module.exports = {
    createScriptScheduleRepository,
    // Export adapters for direct testing
    get ScriptScheduleRepositoryMongo() { return require('./script-schedule-repository-mongo').ScriptScheduleRepositoryMongo; },
    ScriptScheduleRepositoryPostgres,
    get ScriptScheduleRepositoryDocumentDB() { return require('./script-schedule-repository-documentdb').ScriptScheduleRepositoryDocumentDB; },
};
