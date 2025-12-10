const {
    ScriptScheduleRepositoryMongo,
} = require('./script-schedule-repository-mongo');

/**
 * DocumentDB Script Schedule Repository Adapter
 * Handles script schedule persistence using Prisma with AWS DocumentDB
 *
 * DocumentDB is MongoDB-compatible with some limitations:
 * - Uses MongoDB wire protocol
 * - Same Prisma schema as MongoDB
 * - Inherits all MongoDB repository methods
 *
 * For schedule operations, DocumentDB and MongoDB behavior is identical.
 */
class ScriptScheduleRepositoryDocumentDB extends ScriptScheduleRepositoryMongo {
    // Inherits all methods from MongoDB implementation
    // DocumentDB is MongoDB-compatible for these operations
}

module.exports = { ScriptScheduleRepositoryDocumentDB };
