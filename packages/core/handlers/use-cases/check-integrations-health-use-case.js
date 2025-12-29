class CheckIntegrationsHealthUseCase {
    constructor({ moduleFactory, integrationClasses }) {
        this.moduleFactory = moduleFactory;
        this.integrationClasses = integrationClasses;
    }

    execute() {
        const moduleDefinitions =
            this.moduleFactory && this.moduleFactory.moduleDefinitions
                ? this.moduleFactory.moduleDefinitions
                : [];

        const integrationClasses = Array.isArray(this.integrationClasses)
            ? this.integrationClasses
            : [];

        // Extract module names from definitions
        const moduleTypes = Array.isArray(moduleDefinitions)
            ? moduleDefinitions.map(
                  (def) => def.moduleName || def.name || def.label || 'Unknown'
              )
            : [];

        // Extract integration names from classes
        const integrationNames = integrationClasses.map((IntegrationClass) => {
            try {
                return (
                    IntegrationClass.Definition?.name ||
                    IntegrationClass.name ||
                    'Unknown'
                );
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

module.exports = { CheckIntegrationsHealthUseCase };
