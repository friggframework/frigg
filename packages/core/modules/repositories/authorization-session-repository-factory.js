const {
    AuthorizationSessionRepositoryMongo,
} = require('./authorization-session-repository-mongo');
const {
    AuthorizationSessionRepositoryPostgres,
} = require('./authorization-session-repository-postgres');

/**
 * Authorization Session Repository Factory
 * Creates the appropriate repository adapter based on database type
 *
 * Database-specific implementations:
 * - MongoDB: Uses String IDs (ObjectId), TTL index for auto-cleanup
 * - PostgreSQL: Uses Int IDs, manual cleanup via deleteExpired()
 *
 * All repository methods return AuthorizationSession domain entities,
 * ensuring application layer consistency regardless of database type.
 *
 * Environment Configuration:
 * - DB_TYPE=mongodb (default) - Uses MongoDB adapter
 * - DB_TYPE=postgresql - Uses PostgreSQL adapter
 *
 * @example
 * ```javascript
 * const repository = createAuthorizationSessionRepository();
 * const session = await repository.findBySessionId(sessionId);
 * ```
 *
 * @param {Object} [prismaClient] - Optional Prisma client for testing
 * @returns {AuthorizationSessionRepositoryInterface} Configured repository adapter
 * @throws {Error} If DB_TYPE is not supported
 */
function createAuthorizationSessionRepository(prismaClient) {
    const dbType = process.env.DB_TYPE || 'mongodb';

    switch (dbType) {
        case 'mongodb':
            return new AuthorizationSessionRepositoryMongo(prismaClient);

        case 'postgresql':
            return new AuthorizationSessionRepositoryPostgres(prismaClient);

        default:
            throw new Error(
                `Unsupported DB_TYPE: ${dbType}. Supported values: 'mongodb', 'postgresql'`
            );
    }
}

module.exports = {
    createAuthorizationSessionRepository,
    // Export adapters for direct testing
    AuthorizationSessionRepositoryMongo,
    AuthorizationSessionRepositoryPostgres,
};
