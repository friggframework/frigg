const { CredentialRepositoryMongo } = require('./credential-repository-mongo');
const {
    CredentialRepositoryPostgres,
} = require('./credential-repository-postgres');

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
 * const credential = await repository.findCredentialById(id); // ID is string
 * ```
 *
 * @param {Object} [prismaClient] - Optional Prisma client for testing
 * @returns {CredentialRepositoryInterface} Configured repository adapter
 */
function createCredentialRepository(prismaClient) {
    const dbType = process.env.DB_TYPE || 'mongodb';

    switch (dbType) {
        case 'mongodb':
            return new CredentialRepositoryMongo(prismaClient);

        case 'postgresql':
            return new CredentialRepositoryPostgres(prismaClient);

        default:
            throw new Error(
                `Unsupported DB_TYPE: ${dbType}. Supported values: 'mongodb', 'postgresql'`
            );
    }
}

module.exports = {
    createCredentialRepository,
    // Export adapters for direct testing
    CredentialRepositoryMongo,
    CredentialRepositoryPostgres,
};
