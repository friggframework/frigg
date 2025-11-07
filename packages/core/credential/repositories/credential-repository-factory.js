const { CredentialRepositoryMongo } = require('./credential-repository-mongo');
const { CredentialRepositoryPostgres } = require('./credential-repository-postgres');
const { CredentialRepositoryDocumentDB } = require('./credential-repository-documentdb');
const { isDocumentDB } = require('../../database/utils/documentdb-compatibility');
const config = require('../../database/config');

/**
 * Credential Repository Factory
 * Creates the appropriate repository adapter based on database type
 *
 * Database-specific implementations:
 * - MongoDB: Uses String IDs (ObjectId), no conversion needed
 * - PostgreSQL: Uses Int IDs, converts String ↔ Int
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
    if (isDocumentDB()) {
        return new CredentialRepositoryDocumentDB();
    }

    const dbType = config.DB_TYPE;

    switch (dbType) {
        case 'mongodb':
            return new CredentialRepositoryMongo();

        case 'postgresql':
            return new CredentialRepositoryPostgres();

        default:
            throw new Error(
                `Unsupported database type: ${dbType}. Supported values: 'mongodb', 'postgresql'`
            );
    }
}

module.exports = {
    createCredentialRepository,
    CredentialRepositoryMongo,
    CredentialRepositoryPostgres,
    CredentialRepositoryDocumentDB,
};
