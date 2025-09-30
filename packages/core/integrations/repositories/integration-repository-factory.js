const { IntegrationRepositoryMongo } = require('./integration-repository-mongo');
const { IntegrationRepositoryPostgres } = require('./integration-repository-postgres');

/**
 * Integration Repository Factory
 * Creates the appropriate repository adapter based on database type
 *
 * This implements the Factory pattern for Hexagonal Architecture:
 * - Reads DB_TYPE environment variable
 * - Returns correct adapter (MongoDB or PostgreSQL)
 * - Provides clear error for unsupported databases
 * - Allows optional Prisma client injection for testing
 *
 * Usage:
 * ```javascript
 * const repository = createIntegrationRepository();
 * const integration = await repository.findIntegrationById(id);
 * ```
 *
 * @param {Object} [prismaClient] - Optional Prisma client for testing
 * @returns {IntegrationRepositoryInterface} Configured repository adapter
 * @throws {Error} If DB_TYPE is not supported
 */
function createIntegrationRepository(prismaClient) {
    const dbType = process.env.DB_TYPE || 'mongodb';

    switch (dbType) {
        case 'mongodb':
            return new IntegrationRepositoryMongo(prismaClient);

        case 'postgresql':
            return new IntegrationRepositoryPostgres(prismaClient);

        default:
            throw new Error(
                `Unsupported DB_TYPE: ${dbType}. Supported values: 'mongodb', 'postgresql'`
            );
    }
}

module.exports = {
    createIntegrationRepository,
    // Export adapters for direct testing
    IntegrationRepositoryMongo,
    IntegrationRepositoryPostgres,
};
