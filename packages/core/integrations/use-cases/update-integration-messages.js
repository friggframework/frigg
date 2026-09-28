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
     * Executes the integration messages update. Pass the positional form
     * (title, body, timestamp) or one message item object; the keys of an item
     * object are stored as they are.
     * @async
     * @param {string} integrationId - ID of the integration to update.
     * @param {string} messageType - Type of message: 'errors', 'warnings', 'info', or 'logs'.
     * @param {string|Object} messageTitleOrItem - Title of the message, or the whole message item.
     * @param {string} [messageBody] - Body content of the message (positional form).
     * @param {string} [messageTimestamp] - Timestamp when the message was created (positional form).
     * @returns {Promise<Object>} The updated integration record.
     */
    async execute(
        integrationId,
        messageType,
        messageTitleOrItem,
        messageBody,
        messageTimestamp
    ) {
        const integration =
            await this.integrationRepository.updateIntegrationMessages(
                integrationId,
                messageType,
                messageTitleOrItem,
                messageBody,
                messageTimestamp
            );
        return integration;
    }
}

module.exports = { UpdateIntegrationMessages };
