// Removed Integration wrapper - using IntegrationBase directly
const {
    mapIntegrationClassToIntegrationDTO,
} = require('../utils/map-integration-dto');

/**
 * Use case for creating a new integration instance.
 * @class CreateIntegration
 */
class CreateIntegration {
    /**
     * Creates a new CreateIntegration instance.
     * @param {Object} params - Configuration parameters.
     * @param {import('../repositories/integration-repository-interface').IntegrationRepositoryInterface} params.integrationRepository - Repository for integration data operations.
     * @param {import('../integration-classes').IntegrationClasses} params.integrationClasses - Array of available integration classes.
     * @param {import('../../modules/module-factory').ModuleFactory} params.moduleFactory - Service for module instantiation and management.
     */
    constructor({ integrationRepository, integrationClasses, moduleFactory }) {
        this.integrationRepository = integrationRepository;
        this.integrationClasses = integrationClasses;
        this.moduleFactory = moduleFactory;
    }

    /**
     * Executes the integration creation process. Reuses an existing
     * integration when one already exists for the same userId, config.type,
     * and entity set, instead of creating a duplicate.
     * @async
     * @param {string[]} entities - Array of entity IDs to associate with the integration.
     * @param {string} userId - ID of the user creating the integration.
     * @param {Object} config - Configuration object for the integration.
     * @param {string} config.type - Type of integration to create.
     * @returns {Promise<Object>} The created or reused integration DTO.
     * @throws {Error} When integration class is not found for the specified type.
     */
    async execute(entities, userId, config) {
        console.log(
            `[Frigg] Creating ${config?.type} integration for user ${userId} with entities [${entities}]`
        );

        const existing = await this._findDuplicate(
            userId,
            config?.type,
            entities
        );
        if (existing) {
            console.log(
                `[Frigg] Found existing integration ${existing.id} for the same user, type, and entities — reusing it`
            );
            return this._reuseExisting(existing);
        }

        const integrationRecord =
            await this.integrationRepository.createIntegration(
                entities,
                userId,
                config
            );
        console.log(
            `[Frigg] Created integration ${integrationRecord.id} for user ${userId}`
        );

        // A concurrent request may have created a matching row between the
        // lookup above and this insert; re-check before any side effects run.
        const survivor = await this._findDuplicate(
            userId,
            config?.type,
            entities
        );
        if (survivor && String(survivor.id) !== String(integrationRecord.id)) {
            console.log(
                `[Frigg] Concurrent create detected — deleting duplicate ${integrationRecord.id} and reusing ${survivor.id}`
            );
            await this.integrationRepository.deleteIntegrationById(
                integrationRecord.id
            );
            return this._reuseExisting(survivor);
        }

        const integrationInstance = await this._buildInstance(
            integrationRecord
        );
        console.log(
            `[Frigg] Sending ON_CREATE for integration ${integrationRecord.id}`
        );
        try {
            await integrationInstance.send('ON_CREATE', {
                integrationId: integrationRecord.id,
            });
        } catch (error) {
            console.error(
                `[Frigg] ON_CREATE failed for integration ${integrationRecord.id}:`,
                error
            );
            // Stays PROCESSING rather than ERROR: ERROR is the one status
            // reconcileAuthStatus's reuse-time healing clears back to ENABLED
            // once auth is confirmed good, without rerunning setup. Marking a
            // row that never completed creation as ERROR would let a retry
            // with valid-but-unrelated credentials silently heal it to
            // ENABLED with no webhooks ever created.
            await this.integrationRepository.updateIntegrationMessages(
                integrationRecord.id,
                'errors',
                'ON_CREATE Failed',
                error.message,
                Date.now()
            );
            throw error;
        }

        return mapIntegrationClassToIntegrationDTO(integrationInstance);
    }

    async _reuseExisting(integrationRecord) {
        const integrationInstance = await this._buildInstance(
            integrationRecord
        );
        // User is actively trying to reconnect; here if the integration is
        // disabled, we can enable it again.
        const authPassed = await integrationInstance.testAuth();
        await integrationInstance.reconcileAuthStatus(authPassed);
        if (integrationInstance.status === 'DISABLED') {
            console.log(
                `[Frigg] Integration ${integrationInstance.id} changed status from DISABLED to ENABLED`
            );
            await integrationInstance.persistStatus('ENABLED');
        }

        return mapIntegrationClassToIntegrationDTO(integrationInstance);
    }

    async _findDuplicate(userId, type, entityIds) {
        const candidates =
            await this.integrationRepository.findIntegrationsByUserId(userId);
        const target = [...(entityIds ?? [])].map(String).sort();

        const matches = candidates.filter((integration) => {
            if (integration.config?.type !== type) return false;
            const current = [...(integration.entitiesIds ?? [])]
                .map(String)
                .sort();
            return (
                current.length === target.length &&
                current.every((id, index) => id === target[index])
            );
        });

        return matches.length ? this._pickOldest(matches) : null;
    }

    _pickOldest(records) {
        return [...records].sort((a, b) => {
            const diff =
                new Date(a.createdAt ?? 0) - new Date(b.createdAt ?? 0);
            if (diff !== 0) return diff;
            return String(a.id).localeCompare(String(b.id), 'en', {
                numeric: true,
            });
        })[0];
    }

    async _buildInstance(integrationRecord) {
        const integrationClass = this.integrationClasses.find(
            (integrationClass) =>
                integrationClass.Definition.name ===
                integrationRecord.config.type
        );

        if (!integrationClass) {
            throw new Error(
                `No integration class found for type: ${integrationRecord.config.type}`
            );
        }

        const modules = [];
        for (const entityId of integrationRecord.entitiesIds) {
            const moduleInstance = await this.moduleFactory.getModuleInstance(
                entityId,
                integrationRecord.userId
            );
            modules.push(moduleInstance);
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

        await integrationInstance.initialize();

        return integrationInstance;
    }
}

module.exports = { CreateIntegration };
