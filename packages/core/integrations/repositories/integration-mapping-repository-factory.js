const {
    IntegrationMappingRepositoryMongo,
} = require('./integration-mapping-repository-mongo');
const {
    IntegrationMappingRepositoryPostgres,
} = require('./integration-mapping-repository-postgres');
const {
    IntegrationMappingRepositoryDocumentDB,
} = require('./integration-mapping-repository-documentdb');
const {
    IntegrationMappingRepositorySqlite,
} = require('./integration-mapping-repository-sqlite');
const config = require('../../database/config');

/**
 * Integration Mapping Repository Factory
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
 * const repository = createIntegrationMappingRepository();
 * const mapping = await repository.findMappingBy(integrationId, sourceId);
 * ```
 *
 * @returns {IntegrationMappingRepositoryInterface} Configured repository adapter
 */
function createIntegrationMappingRepository() {
    const dbType = config.DB_TYPE;

    switch (dbType) {
        case 'mongodb':
            return new IntegrationMappingRepositoryMongo();

        case 'postgresql':
            return new IntegrationMappingRepositoryPostgres();

        case 'documentdb':
            return new IntegrationMappingRepositoryDocumentDB();

        case 'sqlite':
            return new IntegrationMappingRepositorySqlite();

        default:
            throw new Error(
                `Unsupported database type: ${dbType}. Supported values: 'mongodb', 'documentdb', 'postgresql', 'sqlite'`
            );
    }
}

module.exports = {
    createIntegrationMappingRepository,
    // Export adapters for direct testing
    IntegrationMappingRepositoryMongo,
    IntegrationMappingRepositoryPostgres,
    IntegrationMappingRepositoryDocumentDB,
    IntegrationMappingRepositorySqlite,
};
