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
     * @returns {Promise<void>} Resolves when the integration is deleted. If the
     *   record's config.type is missing or maps to no registered integration
     *   class, the record is deleted best-effort WITHOUT running ON_DELETE
     *   teardown (any external webhooks may need manual cleanup).
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

        // Ownership is independent of config shape — enforce it first so a row
        // with a malformed or unregistered config still cannot be deleted by
        // the wrong user.
        if (integrationRecord.userId !== userId) {
            throw new Error(
                `Integration ${integrationId} does not belong to User ${userId}`
            );
        }

        const integrationType = integrationRecord.config?.type;
        const integrationClass = integrationType
            ? this.integrationClasses.find(
                  (integrationClass) =>
                      integrationClass.Definition.name === integrationType
              )
            : undefined;

        // Without a registered class we cannot instantiate the integration to
        // run ON_DELETE teardown. Rather than throw and leave the row
        // permanently undeletable (a null or decommissioned config.type used to
        // TypeError here and return a 500 forever), delete the record
        // best-effort and log loudly so any external webhooks it still owns get
        // cleaned up out of band.
        if (!integrationClass) {
            console.error(
                `[Integration Deletion] No registered integration class for type ${JSON.stringify(
                    integrationType
                )} (integration ${integrationId}). Deleting the record WITHOUT teardown — any external webhooks may require manual cleanup.`
            );
            await this.integrationRepository.deleteIntegrationById(integrationId);
            return;
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

        await integrationInstance.persistStatus('IN_DELETION');
        try {
            await integrationInstance.send('ON_DELETE');
        } catch (error) {
            const reason = error?.message ?? String(error);
            console.error(
                `[Integration Deletion] onDelete failed for integration ${integrationId}, leaving it IN_DELETION:`,
                reason
            );
            await integrationInstance.updateIntegrationMessages.execute(
                integrationId,
                'errors',
                'Integration Deletion Error',
                `Deletion did not complete: ${reason}`,
                Date.now()
            );
            throw error;
        }

        await this.integrationRepository.deleteIntegrationById(integrationId);
    }
}

module.exports = { DeleteIntegrationForUser };
