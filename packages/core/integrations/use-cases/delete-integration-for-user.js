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
     * @param {import('../../modules/module-factory').ModuleFactory} params.moduleFactory - Service for module instantiation and management.
     */
    constructor({ integrationRepository, integrationClasses, moduleFactory }) {
        /**
         * @type {import('../repositories/integration-repository-interface').IntegrationRepositoryInterface}
         */
        this.integrationRepository = integrationRepository;
        this.integrationClasses = integrationClasses;
        this.moduleFactory = moduleFactory;
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

        // Load modules with API clients for webhook deletion
        const modules = [];
        const failedModuleLoads = [];

        for (const entityId of integrationRecord.entitiesIds) {
            try {
                const moduleInstance = await this.moduleFactory.getModuleInstance(
                    entityId,
                    integrationRecord.userId
                );
                modules.push(moduleInstance);
            } catch (error) {
                console.error(
                    `[Integration Deletion] Failed to load module for entity ${entityId}:`,
                    error.message
                );
                failedModuleLoads.push({ entityId, error: error.message });
            }
        }

        if (failedModuleLoads.length > 0) {
            console.warn(
                `[Integration Deletion] ${failedModuleLoads.length}/${integrationRecord.entitiesIds.length} module(s) failed to load. Webhooks for these modules may require manual cleanup.`
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
            modules,
        });

        // Complete async initialization (load dynamic actions, register handlers)
        await integrationInstance.initialize();

        // Mark IN_DELETION before any teardown runs, so the queue worker
        // discards further events for this integration while teardown is in
        // flight. Done here (not in onDelete) because children override
        // onDelete and call super at the end of teardown, which would mark it
        // too late to matter. Cleanup is best-effort — a failure here does not
        // stop the row from being deleted below.
        await integrationInstance.persistStatus('IN_DELETION');
        try {
            await integrationInstance.send('ON_DELETE');
        } catch (error) {
            const reason = error?.message ?? String(error);
            console.error(
                `[Integration Deletion] onDelete failed for integration ${integrationId}, continuing with deletion:`,
                reason
            );
        }

        await this.integrationRepository.deleteIntegrationById(integrationId);
    }
}

module.exports = { DeleteIntegrationForUser };
