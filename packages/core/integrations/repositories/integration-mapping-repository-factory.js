const {
    IntegrationMappingRepository,
} = require('./integration-mapping-repository');

/**
 * Integration Mapping Repository Factory
 * Creates the appropriate repository adapter based on database type
 *
 * Note: Currently, IntegrationMapping model has identical structure across MongoDB and PostgreSQL,
 * so this factory always returns IntegrationMappingRepository. This pattern is maintained for:
 * - Consistency with other repository factories
 * - Future-proofing if database-specific implementations become needed
 * - Unified API for repository instantiation across the codebase
 *
 * Usage:
 * ```javascript
 * const repository = createIntegrationMappingRepository();
 * const mapping = await repository.findMappingBy(integrationId, sourceId);
 * ```
 *
 * @param {Object} [prismaClient] - Optional Prisma client for testing
 * @returns {IntegrationMappingRepositoryInterface} Configured repository adapter
 */
function createIntegrationMappingRepository(prismaClient) {
    const dbType = process.env.DB_TYPE || 'mongodb';

    // Currently, IntegrationMappingRepository works identically for both databases
    // If database-specific logic is needed in the future, add cases here:
    switch (dbType) {
        case 'mongodb':
            return new IntegrationMappingRepository(prismaClient);

        case 'postgresql':
            return new IntegrationMappingRepository(prismaClient);

        default:
            throw new Error(
                `Unsupported DB_TYPE: ${dbType}. Supported values: 'mongodb', 'postgresql'`
            );
    }
}

module.exports = {
    createIntegrationMappingRepository,
    // Export adapter for direct testing
    IntegrationMappingRepository,
};
