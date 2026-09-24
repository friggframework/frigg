const {
    AdminScriptExecutionRepositoryMongo,
} = require('./admin-script-execution-repository-mongo');

/**
 * DocumentDB Admin Process Repository Adapter
 * Extends MongoDB implementation since DocumentDB uses the same Prisma client
 *
 * DocumentDB-specific characteristics:
 * - Uses MongoDB-compatible API
 * - Prisma client handles the connection
 * - IDs are strings with ObjectId format
 * - All operations identical to MongoDB implementation
 */
class AdminScriptExecutionRepositoryDocumentDB extends AdminScriptExecutionRepositoryMongo {
    constructor() {
        super();
    }
}

module.exports = { AdminScriptExecutionRepositoryDocumentDB };
