const { CredentialRepositoryMongoDBNative } = require('./credential-repository-mongodb-native');
const { CredentialRepositoryPostgres } = require('./credential-repository-postgres');
const config = require('../../database/config');

/**
 * Credential Repository Factory
 * Creates the appropriate repository adapter based on database type
 *
 * Database-specific implementations:
 * - MongoDB/DocumentDB: Uses native MongoDB driver (String IDs/ObjectId), no conversion needed
 * - PostgreSQL: Uses Prisma with Int IDs, converts String ↔ Int
 *
 * All repository methods return String IDs regardless of database type,
 * ensuring application layer consistency.
 *
 * MongoDB/DocumentDB: Uses native driver to avoid Prisma $$REMOVE operator issues
 * PostgreSQL: Uses Prisma (no $$REMOVE issues)
 *
 * Usage:
 * ```javascript
 * const repository = createCredentialRepository();
 * ```
 *
 * @returns {CredentialRepositoryInterface} Configured repository adapter
 */
function createCredentialRepository() {
    const dbType = config.DB_TYPE;

    switch (dbType) {
        case 'mongodb':
        case 'documentdb':
            // Both MongoDB and DocumentDB use native driver
            return new CredentialRepositoryMongoDBNative();

        case 'postgresql':
            return new CredentialRepositoryPostgres();

        default:
            throw new Error(
                `Unsupported database type: ${dbType}. Supported values: 'mongodb', 'documentdb', 'postgresql'`
            );
    }
}

module.exports = {
    createCredentialRepository,
    CredentialRepositoryMongoDBNative,
    CredentialRepositoryPostgres,
};
