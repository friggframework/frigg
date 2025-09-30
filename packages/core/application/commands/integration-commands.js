const {
    IntegrationRepository,
} = require('../../integrations/integration-repository');
const { ModuleRepository } = require('../../modules/module-repository');
const { ModuleFactory } = require('../../modules/module-factory');
const {
    LoadIntegrationContextUseCase,
} = require('../../integrations/use-cases/load-integration-context');
const {
    FindIntegrationContextByExternalEntityIdUseCase,
} = require('../../integrations/use-cases/find-integration-context-by-external-entity-id');
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

function createIntegrationCommands({ integrationClass } = {}) {
    if (!integrationClass) {
        throw new Error('integrationClass is required');
    }

    // Always use Frigg's default repositories and use cases
    const integrationRepository = new IntegrationRepository();
    const moduleRepository = new ModuleRepository();

    const moduleDefinitions = getModulesDefinitionFromIntegrationClasses([
        integrationClass,
    ]);

    const moduleFactory = new ModuleFactory({
        moduleRepository,
        moduleDefinitions,
    });

    const loadUseCase = new LoadIntegrationContextUseCase({
        integrationRepository,
        moduleRepository,
        moduleFactory,
    });

    const findByExternalEntityIdUseCase =
        new FindIntegrationContextByExternalEntityIdUseCase({
            integrationRepository,
            moduleRepository,
            loadIntegrationContextUseCase: loadUseCase,
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
                const context = await loadUseCase.execute({ integrationId });
                return { context };
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
