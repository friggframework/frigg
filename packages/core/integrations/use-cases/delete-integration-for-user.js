const Boom = require('@hapi/boom');
// Removed Integration wrapper - using IntegrationBase directly

/**
 * Use case for deleting an integration for a specific user.
 * @class DeleteIntegrationForUser
 */
class DeleteIntegrationForUser {
    /**
     * Creates a new DeleteIntegrationForUser instance.
     * @param {Object} params - Configuration parameters.
     * @param {import('../repositories/integration-repository-interface').IntegrationRepositoryInterface} params.integrationRepository - Repository for integration data operations.
     * @param {Array<import('../integration').Integration>} params.integrationClasses - Array of available integration classes.
     */
    constructor({ integrationRepository, integrationClasses }) {
        /**
         * @type {import('../repositories/integration-repository-interface').IntegrationRepositoryInterface}
         */
        this.integrationRepository = integrationRepository;
        this.integrationClasses = integrationClasses;
    }

    /**
     * Executes the deletion of an integration for a user.
     * @async
     * @param {string} integrationId - ID of the integration to delete.
     * @param {string} userId - ID of the user requesting the deletion.
     * @returns {Promise<void>} Resolves when the integration is successfully deleted.
     * @throws {Boom.notFound} When integration with the specified ID does not exist.
     * @throws {Error} When the integration doesn't belong to the specified user.
     */
    async execute(integrationId, userId) {
        const integrationRecord =
            await this.integrationRepository.findIntegrationById(integrationId);

        if (!integrationRecord) {
            throw Boom.notFound(
                `Integration with id of ${integrationId} does not exist`
            );
        }

        const integrationClass = this.integrationClasses.find(
            (integrationClass) =>
                integrationClass.Definition.name ===
                integrationRecord.config.type
        );

        if (integrationRecord.userId !== userId) {
            throw new Error(
                `Integration ${integrationId} does not belong to User ${userId}`
            );
        }

        const integrationInstance = new integrationClass({
            id: integrationRecord.id,
            userId: integrationRecord.userId,
            entities: integrationRecord.entitiesIds,
            config: integrationRecord.config,
            status: integrationRecord.status,
            version: integrationRecord.version,
            messages: integrationRecord.messages,
            modules: [],
        });

        // 6. Complete async initialization (load dynamic actions, register handlers)
        await integrationInstance.initialize();
        await integrationInstance.send('ON_DELETE');

        await this.integrationRepository.deleteIntegrationById(integrationId);
    }
}

module.exports = { DeleteIntegrationForUser };
