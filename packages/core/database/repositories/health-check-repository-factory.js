const { HealthCheckRepositoryMongoDB } = require('./health-check-repository-mongodb');
const { HealthCheckRepositoryPostgreSQL } = require('./health-check-repository-postgres');
const config = require('../config');

/**
 * Health Check Repository Factory
 * Creates the appropriate repository adapter based on database type
 *
 * Usage:
 * ```javascript
 * const repository = createHealthCheckRepository();
 * ```
 *
 * @returns {HealthCheckRepositoryInterface} Configured repository adapter
 */
function createHealthCheckRepository() {
    const dbType = config.DB_TYPE;

    switch (dbType) {
        case 'mongodb':
            return new HealthCheckRepositoryMongoDB();

        case 'postgresql':
            return new HealthCheckRepositoryPostgreSQL();

        default:
            throw new Error(
                `Unsupported database type: ${dbType}. Supported values: 'mongodb', 'postgresql'`
            );
    }
}

module.exports = {
    createHealthCheckRepository,
    // Export adapters for direct testing
    HealthCheckRepositoryMongoDB,
    HealthCheckRepositoryPostgreSQL,
};
