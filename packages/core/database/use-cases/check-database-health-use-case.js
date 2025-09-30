/**
 * Use Case for checking database health.
 * Contains business logic for determining database connectivity and health status.
 */
class CheckDatabaseHealthUseCase {
    /**
     * @param {Object} params
     * @param {import('../health-check-repository-interface').HealthCheckRepositoryInterface} params.healthCheckRepository
     */
    constructor({ healthCheckRepository }) {
        this.repository = healthCheckRepository;
    }

    /**
     * Execute database health check
     * @returns {Promise<Object>} Health check result with status, state, and response time
     */
    async execute() {
        const { stateName, isConnected } = this.repository.getDatabaseConnectionState();

        const result = {
            status: isConnected ? 'healthy' : 'unhealthy',
            state: stateName,
        };

        if (isConnected) {
            result.responseTime = await this.repository.pingDatabase(2000);
        }

        return result;
    }
}

module.exports = { CheckDatabaseHealthUseCase };