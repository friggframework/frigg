import type {
    IntegrationClass,
    IntegrationDTO,
    IntegrationModuleDefinition,
} from '../types';

interface IntegrationLike {
    id?: string;
    userId?: string;
    entities?: unknown[];
    config?: unknown;
    status?: string;
    version?: string;
    messages?: unknown;
    userActions?: unknown;
    options?: unknown;
    getOptionDetails?: () => unknown;
}

export function mapIntegrationClassToIntegrationDTO(
    integration: IntegrationLike | null
): IntegrationDTO | null {
    if (!integration) return null;

    return {
        id: integration.id,
        userId: integration.userId,
        entities: integration.entities,
        config: integration.config as IntegrationDTO['config'],
        status: integration.status,
        version: integration.version,
        messages: integration.messages as IntegrationDTO['messages'],
        userActions: integration.userActions,
        options: integration.options ||
            (typeof integration.getOptionDetails === 'function'
                ? integration.getOptionDetails()
                : null),
    };
}

export function getModulesDefinitionFromIntegrationClasses(
    integrationClasses: IntegrationClass[]
): IntegrationModuleDefinition['definition'][] {
    return [
        ...new Set(
            integrationClasses
                .map((integration) =>
                    Object.values(integration.Definition.modules || {}).map(
                        (module: IntegrationModuleDefinition) => module.definition
                    )
                )
                .flat()
        ),
    ];
}
