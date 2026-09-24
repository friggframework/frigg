/**
 * Use case for replacing an integration's entire configuration. Keys not
 * present in the new config are deleted — use PatchIntegrationConfig to
 * merge a partial update without losing untouched keys.
 * @class UpdateIntegrationConfig
 */
class UpdateIntegrationConfig {
    /**
     * Creates a new UpdateIntegrationConfig instance.
     * @param {Object} params - Configuration parameters.
     * @param {import('../repositories/integration-repository-interface').IntegrationRepositoryInterface} params.integrationRepository - Repository for integration data operations.
     */
    constructor({ integrationRepository }) {
        this.integrationRepository = integrationRepository;
    }

    /**
     * Executes the full config replace.
     * @async
     * @param {string} integrationId - ID of the integration to update.
     * @param {Object} config - The new configuration object.
     * @returns {Promise<Object>} The updated integration record.
     */
    async execute(integrationId, config) {
        return this.integrationRepository.updateIntegrationConfig(
            integrationId,
            config
        );
    }
}

module.exports = { UpdateIntegrationConfig };
