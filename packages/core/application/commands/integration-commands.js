const {
    createIntegrationRepository,
} = require('../../integrations/repositories/integration-repository-factory');
const {
    createModuleRepository,
} = require('../../modules/repositories/module-repository-factory');
const { ModuleFactory } = require('../../modules/module-factory');
const {
    LoadIntegrationContextUseCase,
} = require('../../integrations/use-cases/load-integration-context');
const {
    FindIntegrationContextByExternalEntityIdUseCase,
} = require('../../integrations/use-cases/find-integration-context-by-external-entity-id');
const {
    FindIntegrationByEntityExternalIdUseCase,
} = require('../../integrations/use-cases/find-integration-by-entity-external-id');
const {
    ListIntegrationsByEntityExternalIdUseCase,
} = require('../../integrations/use-cases/list-integrations-by-entity-external-id');
const {
    GetIntegrationsForUser,
} = require('../../integrations/use-cases/get-integrations-for-user');
const {
    CreateIntegration,
} = require('../../integrations/use-cases/create-integration');
const {
    UpdateIntegrationConfig,
} = require('../../integrations/use-cases/update-integration-config');
const {
    PatchIntegrationConfig,
} = require('../../integrations/use-cases/patch-integration-config');
const {
    getModulesDefinitionFromIntegrationClasses,
} = require('../../integrations/utils/map-integration-dto');

const ERROR_CODE_MAP = {
    ENTITY_NOT_FOUND: 401,
    ENTITY_USER_NOT_FOUND: 401,
    INTEGRATION_NOT_FOUND: 404,
    EXTERNAL_ID_REQUIRED: 400,
    TYPE_REQUIRED: 400,
    INTEGRATION_RECORD_NOT_FOUND: 404,
};

function mapErrorToResponse(error) {
    const status = ERROR_CODE_MAP[error?.code] || 500;
    return {
        error: status,
        reason: error?.message,
        code: error?.code,
    };
}

function createIntegrationCommands({ integrationClass } = {}) {
    // Always use Frigg's default repositories and use cases
    const integrationRepository = createIntegrationRepository();

    // Class-agnostic read commands. Available with or without an integrationClass
    // so callers that operate across integration types (e.g. admin scripts) can
    // look up integrations by id or list them by type/status.

    /**
     * Find a single integration record by id.
     * @param {string} integrationId
     * @returns {Promise<Object>} Integration record, or an error object.
     */
    async function findIntegrationById(integrationId) {
        try {
            return await integrationRepository.findIntegrationById(
                integrationId
            );
        } catch (error) {
            return mapErrorToResponse(error);
        }
    }

    /**
     * List integrations, optionally filtered by config type and/or status.
     * @param {Object} [filter={}]
     * @param {string} [filter.type] - Integration type (config.type)
     * @param {string} [filter.status] - Integration status
     * @returns {Promise<Array|Object>} Array of integrations, or an error object.
     */
    async function listIntegrations(filter = {}) {
        try {
            return await integrationRepository.findIntegrations(filter);
        } catch (error) {
            return mapErrorToResponse(error);
        }
    }

    /**
     * Report-shaped projection (derived counters + timestamps) — the
     * cross-integration read that reports (ADR-010) consume via commands.
     */
    async function listForReport(filter = {}) {
        try {
            return await integrationRepository.findAllForReport(filter);
        } catch (error) {
            return mapErrorToResponse(error);
        }
    }

    // The remaining commands hydrate/modify integrations for a specific class.
    if (!integrationClass) {
        return { findIntegrationById, listIntegrations, listForReport };
    }

    const moduleRepository = createModuleRepository();

    const moduleDefinitions = getModulesDefinitionFromIntegrationClasses([
        integrationClass,
    ]);

    const moduleFactory = new ModuleFactory({
        moduleRepository,
        moduleDefinitions,
    });

    const loadIntegrationContextUseCase = new LoadIntegrationContextUseCase({
        integrationRepository,
        moduleRepository,
        moduleFactory,
    });

    const findByExternalEntityIdUseCase =
        new FindIntegrationContextByExternalEntityIdUseCase({
            integrationRepository,
            moduleRepository,
            loadIntegrationContextUseCase: loadIntegrationContextUseCase,
        });

    const findIntegrationByEntityExternalIdUseCase =
        new FindIntegrationByEntityExternalIdUseCase({
            integrationRepository,
            moduleRepository,
        });

    const listIntegrationsByEntityExternalIdUseCase =
        new ListIntegrationsByEntityExternalIdUseCase({
            integrationRepository,
            moduleRepository,
        });

    const getIntegrationsForUserUseCase = new GetIntegrationsForUser({
        integrationRepository,
        integrationClasses: [integrationClass],
        moduleFactory,
        moduleRepository,
    });

    const createIntegrationUseCase = new CreateIntegration({
        integrationRepository,
        integrationClasses: [integrationClass],
        moduleFactory,
    });

    const updateIntegrationConfigUseCase = new UpdateIntegrationConfig({
        integrationRepository,
    });

    const patchIntegrationConfigUseCase = new PatchIntegrationConfig({
        integrationRepository,
    });

    return {
        findIntegrationById,
        listIntegrations,
        listForReport,

        /**
         * Find integration context by external entity ID and type
         * @param {Object} params
         * @param {string} params.externalId - External ID of the entity
         * @param {string} params.type - Integration type (config.type)
         * @returns {Promise<Object>} Integration context, entity, and record
         */
        async findIntegrationContextByExternalEntityId({ externalId, type }) {
            try {
                const result = await findByExternalEntityIdUseCase.execute({
                    externalId,
                    type,
                });
                return result;
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },

        /**
         * Resolve an externalId (e.g. HubSpot portalId, Slack team_id) to a
         * single integration ID. Throws on ambiguous resolution at either the
         * entity or integration layer — cross-tenant routing is refused.
         *
         * @param {string|number} externalId - Provider's stable identifier.
         * @param {string} [moduleName] - Disambiguates when multiple modules in
         *     the same app could carry colliding externalIds.
         * @returns {Promise<string|null>} Integration ID, or null on no match.
         * @throws {Error} On ambiguous resolution (multiple entities or
         *     multiple owning integrations).
         */
        async findIntegrationByEntityExternalId(externalId, moduleName) {
            return findIntegrationByEntityExternalIdUseCase.execute({
                externalId,
                moduleName,
            });
        },

        /**
         * List all integration IDs whose module entities match an externalId.
         * Use when one externalId is expected to map to multiple integrations
         * (intentional fan-out). Does not throw on ambiguity.
         *
         * @param {string|number} externalId - Provider's stable identifier.
         * @param {string} [moduleName] - Disambiguates across modules.
         * @returns {Promise<Array<string>>} Array of integration IDs (possibly empty).
         */
        async listIntegrationsByEntityExternalId(externalId, moduleName) {
            return listIntegrationsByEntityExternalIdUseCase.execute({
                externalId,
                moduleName,
            });
        },

        async loadIntegrationContextById(integrationId) {
            try {
                const context = await loadIntegrationContextUseCase.execute({
                    integrationId,
                });
                return { context };
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },

        /**
         * Find all integrations for a user
         * @param {string} userId - User ID to search for
         * @returns {Promise<Array>} Array of integration records
         */
        async findIntegrationsByUserId(userId) {
            try {
                const integrations =
                    await getIntegrationsForUserUseCase.execute(userId);
                return integrations;
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },

        /**
         * Create a new integration
         * @param {Object} params
         * @param {Array<string>} params.entityIds - Array of entity IDs
         * @param {string} params.userId - User ID
         * @param {Object} params.config - Integration configuration (must include type)
         * @returns {Promise<Object>} Created integration object
         */
        async createIntegration({ entityIds, userId, config }) {
            try {
                const integration = await createIntegrationUseCase.execute(
                    entityIds,
                    userId,
                    config
                );
                return integration;
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },

        /**
         * Update integration configuration
         * @param {Object} params
         * @param {string} params.integrationId - Integration ID
         * @param {Object} params.config - Updated config object
         * @returns {Promise<Object>} Updated integration
         */
        async updateIntegrationConfig({ integrationId, config }) {
            try {
                const integration = await updateIntegrationConfigUseCase.execute(
                    integrationId,
                    config
                );
                return integration;
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },

        /**
         * Atomically merge a partial update into an integration's config
         * @param {Object} params
         * @param {string} params.integrationId - Integration ID
         * @param {Object} params.patch - Keys to merge into the existing config
         * @returns {Promise<Object>} Updated integration
         */
        async patchIntegrationConfig({ integrationId, patch }) {
            try {
                const integration = await patchIntegrationConfigUseCase.execute(
                    integrationId,
                    patch
                );
                return integration;
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },

        /**
         * Delete an integration by ID
         * @param {string} integrationId - Integration ID to delete
         * @returns {Promise<Object>} Deletion result
         */
        async deleteIntegrationById(integrationId) {
            try {
                if (!integrationId) {
                    const error = new Error('integrationId is required');
                    error.code = 'INVALID_INTEGRATION_DATA';
                    throw error;
                }

                const deleted = await integrationRepository.deleteIntegrationById(integrationId);

                if (!deleted) {
                    const error = new Error(`Integration ${integrationId} not found`);
                    error.code = 'INTEGRATION_NOT_FOUND';
                    return mapErrorToResponse(error);
                }

                return {
                    success: true,
                    integrationId,
                    message: 'Integration deleted successfully',
                };
            } catch (error) {
                return mapErrorToResponse(error);
            }
        },
    };
}

async function findIntegrationContextByExternalEntityId({
    integrationClass,
    externalId,
    type,
} = {}) {
    const commands = createIntegrationCommands({ integrationClass });

    return commands.findIntegrationContextByExternalEntityId({ externalId, type });
}

module.exports = {
    createIntegrationCommands,
    findIntegrationContextByExternalEntityId,
};
