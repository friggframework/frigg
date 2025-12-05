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
    GetIntegrationsForUser,
} = require('../../integrations/use-cases/get-integrations-for-user');
const {
    CreateIntegration,
} = require('../../integrations/use-cases/create-integration');
const {
    getModulesDefinitionFromIntegrationClasses,
} = require('../../integrations/utils/map-integration-dto');

const ERROR_CODE_MAP = {
    ENTITY_NOT_FOUND: 401,
    ENTITY_USER_NOT_FOUND: 401,
    INTEGRATION_NOT_FOUND: 404,
    EXTERNAL_ENTITY_ID_REQUIRED: 400,
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

function createIntegrationCommands({ integrationClass }) {
    if (!integrationClass) {
        throw new Error('integrationClass is required');
    }

    // Always use Frigg's default repositories and use cases
    const integrationRepository = createIntegrationRepository();
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

    return {
        async findIntegrationContextByExternalEntityId(externalEntityId) {
            try {
                const { context } = await findByExternalEntityIdUseCase.execute(
                    {
                        externalEntityId,
                    }
                );
                return { context };
            } catch (error) {
                return mapErrorToResponse(error);
            }
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
                const integration = await integrationRepository.updateIntegrationConfig(
                    integrationId,
                    config
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
    externalEntityId,
} = {}) {
    const commands = createIntegrationCommands({ integrationClass });

    return commands.findIntegrationContextByExternalEntityId(externalEntityId);
}

module.exports = {
    createIntegrationCommands,
    findIntegrationContextByExternalEntityId,
};
