const {
    ScriptExecutionRepositoryMongo,
} = require('./script-execution-repository-mongo');

/**
 * DocumentDB Script Execution Repository Adapter
 * Extends MongoDB implementation since DocumentDB uses the same Prisma client
 *
 * DocumentDB-specific characteristics:
 * - Uses MongoDB-compatible API
 * - Prisma client handles the connection
 * - IDs are strings with ObjectId format
 * - All operations identical to MongoDB implementation
 */
class ScriptExecutionRepositoryDocumentDB extends ScriptExecutionRepositoryMongo {
    constructor() {
        super();
    }
}

module.exports = { ScriptExecutionRepositoryDocumentDB };
