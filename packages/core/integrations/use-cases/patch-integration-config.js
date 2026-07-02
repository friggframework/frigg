/**
 * Use case for atomically merging a partial update into an integration's
 * configuration, leaving keys not present in the patch untouched.
 * @class PatchIntegrationConfig
 */
class PatchIntegrationConfig {
    /**
     * Creates a new PatchIntegrationConfig instance.
     * @param {Object} params - Configuration parameters.
     * @param {import('../repositories/integration-repository-interface').IntegrationRepositoryInterface} params.integrationRepository - Repository for integration data operations.
     */
    constructor({ integrationRepository }) {
        this.integrationRepository = integrationRepository;
    }

    /**
     * Executes the config patch.
     * @async
     * @param {string} integrationId - ID of the integration to update.
     * @param {Object} patch - Keys to merge into the existing config.
     * @returns {Promise<Object>} The updated integration record.
     */
    async execute(integrationId, patch) {
        return this.integrationRepository.patchIntegrationConfig(
            integrationId,
            patch
        );
    }
}

module.exports = { PatchIntegrationConfig };
