class CheckDatabaseHealthUseCase {
    /**
     * @param {Object} params
     * @param {import('../repositories/health-check-repository-interface').HealthCheckRepositoryInterface} params.healthCheckRepository
     */
    constructor({ healthCheckRepository }) {
        this.repository = healthCheckRepository;
    }

    /**
     * @returns {Promise<{status: string, state: string, responseTime?: number}>}
     */
    async execute() {
        const { stateName, isConnected } = await this.repository.getDatabaseConnectionState();

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