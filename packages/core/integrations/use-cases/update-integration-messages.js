/**
 * Use case for updating messages associated with an integration.
 * @class UpdateIntegrationMessages
 */
class UpdateIntegrationMessages {
    /**
     * Creates a new UpdateIntegrationMessages instance.
     * @param {Object} params - Configuration parameters.
     * @param {import('../repositories/integration-repository-interface').IntegrationRepositoryInterface} params.integrationRepository - Repository for integration data operations.
     */
    constructor({ integrationRepository }) {
        this.integrationRepository = integrationRepository;
    }

    /**
     * Executes the integration messages update.
     * @async
     * @param {string} integrationId - ID of the integration to update.
     * @param {string} messageType - Type of message: 'errors', 'warnings', 'info', or 'logs'.
     * @param {string} messageTitle - Title of the message.
     * @param {string} messageBody - Body content of the message.
     * @param {string} messageTimestamp - Timestamp when the message was created.
     * @returns {Promise<Object>} The updated integration record.
     */
    async execute(
        integrationId,
        messageType,
        messageTitle,
        messageBody,
        messageTimestamp
    ) {
        const integration =
            await this.integrationRepository.updateIntegrationMessages(
                integrationId,
                messageType,
                messageTitle,
                messageBody,
                messageTimestamp
            );
        return integration;
    }
}

module.exports = { UpdateIntegrationMessages };
