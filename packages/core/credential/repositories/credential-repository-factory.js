const { CredentialRepository } = require('./credential-repository');

/**
 * Credential Repository Factory
 * Creates the appropriate repository adapter based on database type
 *
 * Note: Currently, Credential model has identical structure across MongoDB and PostgreSQL,
 * so this factory always returns CredentialRepository. This pattern is maintained for:
 * - Consistency with other repository factories
 * - Future-proofing if database-specific implementations become needed
 * - Unified API for repository instantiation across the codebase
 *
 * Usage:
 * ```javascript
 * const repository = createCredentialRepository();
 * const credential = await repository.findCredentialById(id);
 * ```
 *
 * @param {Object} [prismaClient] - Optional Prisma client for testing
 * @returns {CredentialRepositoryInterface} Configured repository adapter
 */
function createCredentialRepository(prismaClient) {
    const dbType = process.env.DB_TYPE || 'mongodb';

    // Currently, CredentialRepository works identically for both databases
    // If database-specific logic is needed in the future, add cases here:
    switch (dbType) {
        case 'mongodb':
            return new CredentialRepository(prismaClient);

        case 'postgresql':
            return new CredentialRepository(prismaClient);

        default:
            throw new Error(
                `Unsupported DB_TYPE: ${dbType}. Supported values: 'mongodb', 'postgresql'`
            );
    }
}

module.exports = {
    createCredentialRepository,
    // Export adapter for direct testing
    CredentialRepository,
};
