const {
    AdminApiKeyRepositoryMongo,
} = require('./admin-api-key-repository-mongo');

/**
 * DocumentDB Admin API Key Repository Adapter
 * Extends MongoDB implementation since DocumentDB uses the same Prisma client
 *
 * DocumentDB-specific characteristics:
 * - Uses MongoDB-compatible API
 * - Prisma client handles the connection
 * - IDs are strings with ObjectId format
 * - All operations identical to MongoDB implementation
 */
class AdminApiKeyRepositoryDocumentDB extends AdminApiKeyRepositoryMongo {
    constructor() {
        super();
    }
}

module.exports = { AdminApiKeyRepositoryDocumentDB };
