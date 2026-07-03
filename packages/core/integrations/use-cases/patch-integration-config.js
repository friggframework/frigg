/**
 * Use case for atomically merging a partial update into an integration's
 * configuration, leaving keys not present in the patch untouched.
 *
 * The merge is shallow: only top-level config keys are affected, and each
 * key in the patch replaces its existing value wholesale (a nested object is
 * overwritten as a block, not deep-merged). To change one field inside a
 * nested object without dropping its siblings, pass the whole updated object
 * as that key's value. To delete a key or write null, use a full replace via
 * UpdateIntegrationConfig instead.
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
