const { HealthCheckRepository } = require('./health-check-repository');

/**
 * Health Check Repository Factory
 * Creates the appropriate repository adapter based on database type
 *
 * Note: Currently, HealthCheck operations have identical structure across MongoDB and PostgreSQL,
 * so this factory always returns HealthCheckRepository. This pattern is maintained for:
 * - Consistency with other repository factories
 * - Future-proofing if database-specific implementations become needed
 * - Unified API for repository instantiation across the codebase
 *
 * Usage:
 * ```javascript
 * const repository = createHealthCheckRepository();
 * const responseTime = await repository.pingDatabase(2000);
 * ```
 *
 * @returns {HealthCheckRepositoryInterface} Configured repository adapter
 */
function createHealthCheckRepository() {
    const dbType = process.env.DB_TYPE || 'mongodb';

    // Currently, HealthCheckRepository works identically for both databases
    // If database-specific logic is needed in the future, add cases here:
    switch (dbType) {
        case 'mongodb':
            return new HealthCheckRepository();

        case 'postgresql':
            return new HealthCheckRepository();

        default:
            throw new Error(
                `Unsupported DB_TYPE: ${dbType}. Supported values: 'mongodb', 'postgresql'`
            );
    }
}

module.exports = {
    createHealthCheckRepository,
    // Export adapter for direct testing
    HealthCheckRepository,
};
