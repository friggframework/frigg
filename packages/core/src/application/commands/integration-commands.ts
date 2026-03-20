/* eslint-disable @typescript-eslint/no-require-imports */
const {
    createIntegrationRepository,
} = require('../../../integrations/repositories/integration-repository-factory');
const {
    createModuleRepository,
} = require('../../../modules/repositories/module-repository-factory');
const { ModuleFactory } = require('../../../modules/module-factory');
const {
    LoadIntegrationContextUseCase,
} = require('../../../integrations/use-cases/load-integration-context');
const {
    FindIntegrationContextByExternalEntityIdUseCase,
} = require('../../../integrations/use-cases/find-integration-context-by-external-entity-id');
const {
    GetIntegrationsForUser,
} = require('../../../integrations/use-cases/get-integrations-for-user');
const {
    CreateIntegration,
} = require('../../../integrations/use-cases/create-integration');
const {
    getModulesDefinitionFromIntegrationClasses,
} = require('../../../integrations/utils/map-integration-dto');

export interface IntegrationClass {
    name?: string;
    [key: string]: unknown;
}

export interface ErrorResponse {
    error: number;
    reason?: string;
    code?: string;
}

export interface IntegrationContext {
    [key: string]: unknown;
}

export interface IntegrationRecord {
    [key: string]: unknown;
}

export interface CreateIntegrationParams {
    entityIds: string[];
    userId: string;
    config: Record<string, unknown>;
}

export interface UpdateIntegrationConfigParams {
    integrationId: string;
    config: Record<string, unknown>;
}

export interface DeleteIntegrationResult {
    success: boolean;
    integrationId: string;
    message: string;
}

export interface IntegrationCommands {
    findIntegrationContextByExternalEntityId(externalEntityId: string): Promise<{ context: IntegrationContext } | ErrorResponse>;
    loadIntegrationContextById(integrationId: string): Promise<{ context: IntegrationContext } | ErrorResponse>;
    findIntegrationsByUserId(userId: string): Promise<IntegrationRecord[] | ErrorResponse>;
    createIntegration(params: CreateIntegrationParams): Promise<IntegrationRecord | ErrorResponse>;
    updateIntegrationConfig(params: UpdateIntegrationConfigParams): Promise<IntegrationRecord | ErrorResponse>;
    deleteIntegrationById(integrationId: string): Promise<DeleteIntegrationResult | ErrorResponse>;
}

const ERROR_CODE_MAP: Record<string, number> = {
    ENTITY_NOT_FOUND: 401,
    ENTITY_USER_NOT_FOUND: 401,
    INTEGRATION_NOT_FOUND: 404,
    EXTERNAL_ENTITY_ID_REQUIRED: 400,
    INTEGRATION_RECORD_NOT_FOUND: 404,
};

function mapErrorToResponse(error: Error & { code?: string }): ErrorResponse {
    const status = ERROR_CODE_MAP[error?.code ?? ''] || 500;
    return {
        error: status,
        reason: error?.message,
        code: error?.code,
    };
}

export function createIntegrationCommands({ integrationClass }: { integrationClass: IntegrationClass }): IntegrationCommands {
    if (!integrationClass) {
        throw new Error('integrationClass is required');
    }

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
        async findIntegrationContextByExternalEntityId(externalEntityId: string) {
            try {
                const { context } = await findByExternalEntityIdUseCase.execute(
                    {
                        externalEntityId,
                    }
                );
                return { context };
            } catch (error) {
                return mapErrorToResponse(error as Error & { code?: string });
            }
        },

        async loadIntegrationContextById(integrationId: string) {
            try {
                const context = await loadIntegrationContextUseCase.execute({
                    integrationId,
                });
                return { context };
            } catch (error) {
                return mapErrorToResponse(error as Error & { code?: string });
            }
        },

        async findIntegrationsByUserId(userId: string) {
            try {
                const integrations =
                    await getIntegrationsForUserUseCase.execute(userId);
                return integrations;
            } catch (error) {
                return mapErrorToResponse(error as Error & { code?: string });
            }
        },

        async createIntegration({ entityIds, userId, config }: CreateIntegrationParams) {
            try {
                const integration = await createIntegrationUseCase.execute(
                    entityIds,
                    userId,
                    config
                );
                return integration;
            } catch (error) {
                return mapErrorToResponse(error as Error & { code?: string });
            }
        },

        async updateIntegrationConfig({ integrationId, config }: UpdateIntegrationConfigParams) {
            try {
                const integration = await integrationRepository.updateIntegrationConfig(
                    integrationId,
                    config
                );
                return integration;
            } catch (error) {
                return mapErrorToResponse(error as Error & { code?: string });
            }
        },

        async deleteIntegrationById(integrationId: string) {
            try {
                if (!integrationId) {
                    const error = new Error('integrationId is required') as Error & { code?: string };
                    error.code = 'INVALID_INTEGRATION_DATA';
                    throw error;
                }

                const deleted = await integrationRepository.deleteIntegrationById(integrationId);

                if (!deleted) {
                    const error = new Error(`Integration ${integrationId} not found`) as Error & { code?: string };
                    error.code = 'INTEGRATION_NOT_FOUND';
                    return mapErrorToResponse(error);
                }

                return {
                    success: true,
                    integrationId,
                    message: 'Integration deleted successfully',
                };
            } catch (error) {
                return mapErrorToResponse(error as Error & { code?: string });
            }
        },
    };
}

export async function findIntegrationContextByExternalEntityId({
    integrationClass,
    externalEntityId,
}: {
    integrationClass: IntegrationClass;
    externalEntityId: string;
}): Promise<{ context: IntegrationContext } | ErrorResponse> {
    const commands = createIntegrationCommands({ integrationClass });

    return commands.findIntegrationContextByExternalEntityId(externalEntityId);
}
