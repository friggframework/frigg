const { IntegrationRepositoryMongoDBNative } = require('./integration-repository-mongodb-native');
const { IntegrationRepositoryPostgres } = require('./integration-repository-postgres');
const config = require('../../database/config');

/**
 * Integration Repository Factory
 * Creates the appropriate repository adapter based on database type
 *
 * This implements the Factory pattern for Hexagonal Architecture:
 * - Reads database type from app definition (backend/index.js)
 * - Returns correct adapter (MongoDB Native Driver or Prisma for PostgreSQL)
 * - Provides clear error for unsupported databases
 *
 * MongoDB/MongoDBNative: Uses native MongoDB driver (avoids Prisma $$REMOVE operator issues)
 * PostgreSQL: Uses Prisma (no $$REMOVE issues)
 *
 * Usage:
 * ```javascript
 * const repository = createIntegrationRepository();
 * ```
 *
 * @returns {IntegrationRepositoryInterface} Configured repository adapter
 * @throws {Error} If database type is not supported
 */
function createIntegrationRepository() {
    const dbType = config.DB_TYPE;

    switch (dbType) {
        case 'mongodb':
        case 'documentdb':
        case 'mongodb-native':
            // Both MongoDB and MongoDBNative use native driver
            return new IntegrationRepositoryMongoDBNative();

        case 'postgresql':
            return new IntegrationRepositoryPostgres();

        default:
            throw new Error(
                `Unsupported database type: ${dbType}. Supported values: 'mongodb', 'mongodb-native', 'postgresql'`
            );
    }
}

module.exports = {
    createIntegrationRepository,
    IntegrationRepositoryMongoDBNative,
    IntegrationRepositoryPostgres,
};
