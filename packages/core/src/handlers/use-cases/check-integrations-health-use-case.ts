export interface ModuleFactory {
    moduleDefinitions?: Array<{
        moduleName?: string;
        name?: string;
        label?: string;
    }>;
}

export interface IntegrationsHealthResult {
    status: string;
    modules: {
        count: number;
        available: string[];
    };
    integrations: {
        count: number;
        available: string[];
    };
}

export interface CheckIntegrationsHealthDeps {
    moduleFactory: ModuleFactory | undefined;
    integrationClasses: any[];
}

export class CheckIntegrationsHealthUseCase {
    moduleFactory: ModuleFactory | undefined;
    integrationClasses: any[];

    constructor({ moduleFactory, integrationClasses }: CheckIntegrationsHealthDeps) {
        this.moduleFactory = moduleFactory;
        this.integrationClasses = integrationClasses;
    }

    execute(): IntegrationsHealthResult {
        const moduleDefinitions = (this.moduleFactory && this.moduleFactory.moduleDefinitions)
            ? this.moduleFactory.moduleDefinitions
            : [];

        const integrationClasses = Array.isArray(this.integrationClasses)
            ? this.integrationClasses
            : [];

        // Extract module names from definitions
        const moduleTypes = Array.isArray(moduleDefinitions)
            ? moduleDefinitions.map(def => def.moduleName || def.name || def.label || 'Unknown')
            : [];

        // Extract integration names from classes
        const integrationNames = integrationClasses.map((IntegrationClass: any) => {
            try {
                return IntegrationClass.Definition?.name || IntegrationClass.name || 'Unknown';
            } catch {
                return 'Unknown';
            }
        });

        return {
            status: 'healthy',
            modules: {
                count: moduleTypes.length,
                available: moduleTypes,
            },
            integrations: {
                count: integrationNames.length,
                available: integrationNames,
            },
        };
    }
}

