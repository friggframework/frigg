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
            return this._reuseExisting(existing, config);
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
        const survivor = await this._findSurvivor(
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
            return this._reuseExisting(survivor, config);
        }

        const integrationInstance = await this._buildInstance(
            integrationRecord
        );
        console.log(
            `[Frigg] Sending ON_CREATE for integration ${integrationRecord.id}`
        );
        await integrationInstance.send('ON_CREATE', {
            integrationId: integrationRecord.id,
        });

        return mapIntegrationClassToIntegrationDTO(integrationInstance);
    }

    async _reuseExisting(integrationRecord, config) {
        // The caller may be reconnecting with changed settings. Persist the
        // requested config onto the reused row as a shallow patch, so new
        // values take effect while keys added during the original create
        // (webhook ids, secrets) survive. `type` is re-written to the same
        // value it dedupe-matched on, which is a harmless no-op.
        if (config && Object.keys(config).length > 0) {
            integrationRecord =
                await this.integrationRepository.patchIntegrationConfig(
                    integrationRecord.id,
                    config
                );
        }

        const integrationInstance = await this._buildInstance(
            integrationRecord
        );

        if (integrationInstance.status === 'IN_CREATION') {
            // ON_CREATE never finished for this row (crashed mid-setup or is
            // still running concurrently). Re-firing ON_CREATE here would
            // risk re-registering a webhook a partially-completed attempt
            // already created — unsafe without idempotent setup, which is a
            // separate, larger change. Surfaced loudly rather than silently
            // reused as if healthy, so it's diagnosable; testAuth below still
            // runs and can at least surface bad credentials as ERROR.
            console.warn(
                `[Frigg] Integration ${integrationInstance.id} is still IN_CREATION on reuse — setup never completed`
            );
        }

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

    async _findMatches(userId, type, entityIds) {
        const candidates =
            await this.integrationRepository.findIntegrationsByUserId(userId);
        const target = new Set((entityIds ?? []).map(String));

        const live = candidates.filter(
            (integration) =>
                // An IN_DELETION row is either mid-teardown or a zombie left
                // behind by a failed deleteIntegrationById call — never a live
                // integration. Treating it as a duplicate would hand a
                // reinstall attempt a row nothing will ever move out of
                // IN_DELETION, silently discarded by the queue worker forever.
                // Let a fresh create proceed instead; the zombie is cleaned up
                // out-of-band, matching how teardown failures are already
                // handled here.
                integration.status !== 'IN_DELETION' &&
                integration.config?.type === type
        );
        const entitySet = (integration) =>
            new Set((integration.entitiesIds ?? []).map(String));

        const exact = live.filter((integration) => {
            const current = entitySet(integration);
            return (
                current.size === target.size &&
                [...target].every((id) => current.has(id))
            );
        });

        // Entities may have been attached after create (addEntitiesToIntegration),
        // so a reconnect that sends the original entities must still find the
        // integration that now holds them, instead of creating a second one
        // that would share those entities.
        const supersets = live.filter((integration) => {
            const current = entitySet(integration);
            return [...target].every((id) => current.has(id));
        });
        return { exact, supersets: target.size ? supersets : [] };
    }

    async _findDuplicate(userId, type, entityIds) {
        const { exact, supersets } = await this._findMatches(
            userId,
            type,
            entityIds
        );
        if (exact.length) return this._pickOldest(exact);
        return supersets.length ? this._pickOldest(supersets) : null;
    }

    // After an insert the new row is itself an exact match, so the survivor
    // is the oldest of every exact or superset match (the new row included):
    // an older integration that already holds these entities always wins.
    async _findSurvivor(userId, type, entityIds) {
        const { exact, supersets } = await this._findMatches(
            userId,
            type,
            entityIds
        );
        // supersets includes the exact matches; it is empty only for an
        // empty entity set, where exact matching alone applies.
        const matches = supersets.length ? supersets : exact;
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
