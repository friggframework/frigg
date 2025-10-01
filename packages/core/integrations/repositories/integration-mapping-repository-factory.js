const {
    IntegrationMappingRepositoryMongo,
} = require('./integration-mapping-repository-mongo');
const {
    IntegrationMappingRepositoryPostgres,
} = require('./integration-mapping-repository-postgres');

/**
 * Integration Mapping Repository Factory
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
 * const repository = createIntegrationMappingRepository();
 * const mapping = await repository.findMappingBy(integrationId, sourceId); // integrationId is string
 * ```
 *
 * @param {Object} [prismaClient] - Optional Prisma client for testing
 * @returns {IntegrationMappingRepositoryInterface} Configured repository adapter
 */
function createIntegrationMappingRepository(prismaClient) {
    const dbType = process.env.DB_TYPE || 'mongodb';

    switch (dbType) {
        case 'mongodb':
            return new IntegrationMappingRepositoryMongo(prismaClient);

        case 'postgresql':
            return new IntegrationMappingRepositoryPostgres(prismaClient);

        default:
            throw new Error(
                `Unsupported DB_TYPE: ${dbType}. Supported values: 'mongodb', 'postgresql'`
            );
    }
}

module.exports = {
    createIntegrationMappingRepository,
    // Export adapters for direct testing
    IntegrationMappingRepositoryMongo,
    IntegrationMappingRepositoryPostgres,
};
