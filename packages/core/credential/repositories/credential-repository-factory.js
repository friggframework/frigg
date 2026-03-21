const {
    CredentialRepositoryPostgres,
} = require('./credential-repository-postgres');
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
    const dbType = config.DB_TYPE;

    switch (dbType) {
        case 'mongodb':
            const { CredentialRepositoryMongo } = require('./credential-repository-mongo');
            return new CredentialRepositoryMongo();

        case 'postgresql':
            return new CredentialRepositoryPostgres();

        case 'documentdb':
            const { CredentialRepositoryDocumentDB } = require('./credential-repository-documentdb');
            return new CredentialRepositoryDocumentDB();

        default:
            throw new Error(
                `Unsupported database type: ${dbType}. Supported values: 'mongodb', 'documentdb', 'postgresql'`
            );
    }
}

module.exports = {
    createCredentialRepository,
    // Export adapters for direct testing
    get CredentialRepositoryMongo() { return require('./credential-repository-mongo').CredentialRepositoryMongo; },
    CredentialRepositoryPostgres,
    get CredentialRepositoryDocumentDB() { return require('./credential-repository-documentdb').CredentialRepositoryDocumentDB; },
};
