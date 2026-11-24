/**
 * Use case for updating the status of an integration.
 * @class UpdateIntegrationStatus
 */
class UpdateIntegrationStatus {
    /**
     * Creates a new UpdateIntegrationStatus instance.
     * @param {Object} params - Configuration parameters.
     * @param {import('../repositories/integration-repository-interface').IntegrationRepositoryInterface} params.integrationRepository - Repository for integration data operations.
     */
    constructor({ integrationRepository }) {
        this.integrationRepository = integrationRepository;
    }

    /**
     * Executes the integration status update.
     * @async
     * @param {string} integrationId - ID of the integration to update.
     * @param {string} status - New status for the integration (e.g., 'ENABLED', 'DISABLED', 'ERROR').
     * @returns {Promise<Object>} The updated integration record.
     */
    async execute(integrationId, status) {
        const integration =
            await this.integrationRepository.updateIntegrationStatus(
                integrationId,
                status
            );
        return integration;
    }
}

module.exports = { UpdateIntegrationStatus };
