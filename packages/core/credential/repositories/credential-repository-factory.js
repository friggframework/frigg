const { CredentialRepositoryMongo } = require('./credential-repository-mongo');
const {
    CredentialRepositoryPostgres,
} = require('./credential-repository-postgres');
const {
    CredentialRepositoryDocumentDB,
} = require('./credential-repository-documentdb');
const {
    CredentialRepositorySqlite,
} = require('./credential-repository-sqlite');
const config = require('../../database/config');

/**
 * Credential Repository Factory
 * Creates the appropriate repository adapter based on database type
 *
 * Database-specific implementations:
 * - MongoDB: Uses String IDs (ObjectId), no conversion needed
 * - PostgreSQL/SQLite: Uses Int IDs, converts String ↔ Int
 *
 * All repository methods return String IDs regardless of database type,
 * ensuring application layer consistency.
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
            return new CredentialRepositoryMongo();

        case 'postgresql':
            return new CredentialRepositoryPostgres();

        case 'documentdb':
            return new CredentialRepositoryDocumentDB();

        case 'sqlite':
            return new CredentialRepositorySqlite();

        default:
            throw new Error(
                `Unsupported database type: ${dbType}. Supported values: 'mongodb', 'documentdb', 'postgresql', 'sqlite'`
            );
    }
}

module.exports = {
    createCredentialRepository,
    // Export adapters for direct testing
    CredentialRepositoryMongo,
    CredentialRepositoryPostgres,
    CredentialRepositoryDocumentDB,
    CredentialRepositorySqlite,
};
